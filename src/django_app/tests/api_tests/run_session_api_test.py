import pytest
from django.urls import reverse
from rest_framework import status

from tables.models import Session
from tables.serializers.nested_model_serializers import NestedSessionSerializer
from tests.fixtures import *
from tables.services import converter_service


@pytest.mark.django_db
def test_run_session(api_client, redis_client_mock, session_data):
    url = reverse("run-session")

    response = api_client.post(url, session_data, format="json")

    response_session_id: int = response.data["session_id"]
    response_session = Session.objects.get(pk=response_session_id)

    assert response.status_code == status.HTTP_201_CREATED, response.content
    assert response_session.graph.pk == session_data["graph_id"]
    assert response_session.variables == session_data["variables"]
    redis_client_mock.publish.assert_called()
    assert response_session.status == "pending"


@pytest.mark.django_db
def test_create_session(api_client, crew, graph):
    url = reverse("session-list")
    data = {"crew": crew.pk, "status": "run", "graph_id": graph.pk}

    response = api_client.post(url, data, format="json")

    assert response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED, response.content
    assert Session.objects.count() == 0


@pytest.mark.django_db
def test_get_sessions_empty(api_client):
    url = reverse("session-list")

    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data == {
        "count": 0,
        "next": None,
        "previous": None,
        "results": [],
    }


@pytest.mark.django_db
def test_get_sessions_with_data(api_client, session):
    url = reverse("session-list")

    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data["count"] == 1
    assert len(response.data["results"]) == 1
    assert response.data["results"][0]["id"] == session.pk


@pytest.mark.django_db
def test_get_session_by_id(api_client, session):
    url = reverse("session-detail", args=[session.pk])

    response = api_client.get(url)

    # TODO: check out graph_schema
    # crew_data = NestedSessionSerializer(session).data["crew"]
    # converter_service.inject_tasks(crew_data)
    # for task in crew_data.get("tasks", []):
    #     if "crew" in task:
    #         del task["crew"]

    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data["id"] == session.pk
    assert response.data["graph"] == session.graph.id
    # assert response.data["graph_schema"]["tasks"] == crew_data["tasks"]


@pytest.mark.django_db
def test_get_session_by_invalid_id(api_client):
    url = reverse("session-detail", args=[999])

    response = api_client.get(url)

    assert response.status_code == status.HTTP_404_NOT_FOUND, response.content


@pytest.mark.django_db
def test_session_delete(api_client, session):
    url = reverse("session-detail", args=[session.pk])

    response = api_client.delete(url)

    assert response.status_code == status.HTTP_204_NO_CONTENT, response.content

    response = api_client.get(url)

    assert response.status_code == status.HTTP_404_NOT_FOUND, response.content

    test_get_sessions_empty(api_client)


@pytest.mark.django_db
def test_get_session_statuses(api_client, session):
    url = reverse("session-statuses")

    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK, response.content
    assert (
        response.data.get(session.graph.id).get(Session.SessionStatus.PENDING.value)
        == 1
    )


@pytest.mark.django_db
def test_get_session_statuses_no_sessions(api_client):
    url = reverse("session-statuses")

    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK, response.content
    assert len(response.data) == 0


@pytest.mark.django_db
def test_get_session_statuses_by_graph_id(api_client, session):
    url = reverse("session-statuses")

    response = api_client.get(url, {"graph_id": session.graph.pk})

    assert response.status_code == status.HTTP_200_OK, response.content
    assert (
        response.data.get(session.graph.id).get(Session.SessionStatus.PENDING.value)
        == 1
    )


@pytest.mark.django_db
def test_get_session_statuses_by_invalid_graph_id(api_client, session):
    url = reverse("session-statuses")

    response = api_client.get(url, {"graph_id": 999})

    assert response.status_code == status.HTTP_400_BAD_REQUEST, response.content
