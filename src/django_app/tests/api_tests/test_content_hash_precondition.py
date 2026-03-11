import pytest
from django.urls import reverse
from rest_framework import status

from tables.exceptions import ContentHashConflictError
from tables.models import CrewNode, Graph, StartNode
from tests.fixtures import *


@pytest.fixture
def crew_node(graph, crew):
    return CrewNode.objects.create(node_name="test_crew_node", crew=crew, graph=graph)


@pytest.fixture
def start_node(graph):
    return StartNode.objects.create(graph=graph, variables={})


# ---------------------------------------------------------------------------
# View-level: standard viewset (CrewNode)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestContentHashPreconditionViewSet:
    def test_patch_with_correct_hash_succeeds(self, api_client, crew_node):
        url = reverse("crewnode-detail", args=[crew_node.id])
        response = api_client.patch(
            url,
            {"node_name": "updated_name", "content_hash": crew_node.content_hash},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.content

    def test_patch_with_stale_hash_returns_409(self, api_client, crew_node):
        url = reverse("crewnode-detail", args=[crew_node.id])
        response = api_client.patch(
            url,
            {"node_name": "updated_name", "content_hash": "stale_or_wrong_hash"},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.content
        assert response.data["code"] == "content_hash_conflict"

    def test_patch_without_hash_succeeds(self, api_client, crew_node):
        """Omitting content_hash skips validation — backward compatible."""
        url = reverse("crewnode-detail", args=[crew_node.id])
        response = api_client.patch(
            url,
            {"node_name": "updated_name"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.content

    def test_put_with_correct_hash_succeeds(self, api_client, crew_node):
        url = reverse("crewnode-detail", args=[crew_node.id])
        response = api_client.put(
            url,
            {
                "node_name": "replaced_name",
                "graph": crew_node.graph_id,
                "crew_id": crew_node.crew_id,
                "content_hash": crew_node.content_hash,
                "metadata": {},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.content

    def test_put_with_stale_hash_returns_409(self, api_client, crew_node):
        url = reverse("crewnode-detail", args=[crew_node.id])
        response = api_client.put(
            url,
            {
                "node_name": "replaced_name",
                "graph": crew_node.graph_id,
                "crew_id": crew_node.crew_id,
                "content_hash": "outdated_hash",
                "metadata": {},
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.content

    def test_second_concurrent_update_is_rejected(self, api_client, crew_node):
        """Simulate two users: first save wins, second is rejected with stale hash."""
        original_hash = crew_node.content_hash
        url = reverse("crewnode-detail", args=[crew_node.id])

        # User A saves successfully
        response_a = api_client.patch(
            url,
            {"node_name": "user_a_name", "content_hash": original_hash},
            format="json",
        )
        assert response_a.status_code == status.HTTP_200_OK

        # User B still holds the original hash — their save is rejected
        response_b = api_client.patch(
            url,
            {"node_name": "user_b_name", "content_hash": original_hash},
            format="json",
        )
        assert response_b.status_code == status.HTTP_409_CONFLICT


# ---------------------------------------------------------------------------
# View-level: StartNode (BaseGraphEntity without BaseNode)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestContentHashStartNode:
    def test_patch_with_correct_hash_succeeds(self, api_client, start_node):
        url = reverse("startnode-detail", args=[start_node.id])
        response = api_client.patch(
            url,
            {"variables": {"key": "value"}, "content_hash": start_node.content_hash},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.content

    def test_patch_with_stale_hash_returns_409(self, api_client, start_node):
        url = reverse("startnode-detail", args=[start_node.id])
        response = api_client.patch(
            url,
            {"variables": {"key": "value"}, "content_hash": "wrong_hash"},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.content


# ---------------------------------------------------------------------------
# Model-level: ContentHashMixin._expected_hash validation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestContentHashModelLevel:
    def test_save_with_correct_expected_hash_succeeds(self, crew_node):
        crew_node._expected_hash = crew_node.content_hash
        crew_node.node_name = "direct_update"
        crew_node.save()  # should not raise

        crew_node.refresh_from_db()
        assert crew_node.node_name == "direct_update"

    def test_save_with_wrong_expected_hash_raises(self, crew_node):
        crew_node._expected_hash = "wrong_hash"
        crew_node.node_name = "should_not_save"

        with pytest.raises(ContentHashConflictError):
            crew_node.save()

    def test_save_without_expected_hash_skips_validation(self, crew_node):
        """No _expected_hash set — validation is bypassed (default behaviour)."""
        crew_node.node_name = "silent_update"
        crew_node.save()

        crew_node.refresh_from_db()
        assert crew_node.node_name == "silent_update"

    def test_hash_is_updated_after_save(self, crew_node):
        old_hash = crew_node.content_hash
        crew_node._expected_hash = old_hash
        crew_node.node_name = "changed_name"
        crew_node.save()

        crew_node.refresh_from_db()
        assert crew_node.content_hash != old_hash

    def test_new_object_skips_hash_validation(self, graph, crew):
        """Creating a new record should never trigger the hash check."""
        node = CrewNode(node_name="brand_new", crew=crew, graph=graph)
        node._expected_hash = "irrelevant_for_new_object"
        node.save()  # should not raise

        assert node.pk is not None
