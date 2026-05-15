"""
Integration tests for the Flow Assistant feature.

Mocks: LLM client only.
Real: ORM, serializers, views, URL routing.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tables.models import (
    Graph,
    LLMConfig,
    LLMModel,
    Organization,
    OrganizationUser,
    Provider,
    Role,
)
from tables.models.flow_assistant_models import FlowAssistant, FlowAssistantConversation
from tables.services.flow_assistant import FlowAssistantService
from tables.services.llm_clients.base import (
    DoneEvent,
    StructuredEvent,
    TokenEvent,
    ToolCallEvent,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def openai_provider(db):
    return Provider.objects.create(name="openai")


@pytest.fixture
def gpt4_model(openai_provider):
    return LLMModel.objects.create(name="gpt-4o", llm_provider=openai_provider)


@pytest.fixture
def llm_config(gpt4_model):
    return LLMConfig.objects.create(
        custom_name="test-gpt4o",
        model=gpt4_model,
        temperature=0.5,
    )


@pytest.fixture
def graph(db):
    return Graph.objects.create(name="Test Flow", description="A test flow.")


@pytest.fixture
def org_a(db):
    return Organization.objects.create(name="Org A")


@pytest.fixture
def org_b(db):
    return Organization.objects.create(name="Org B")


@pytest.fixture
def default_role(db):
    return Role.objects.get_or_create(name="member")[0]


@pytest.fixture
def user_a(db):
    return get_user_model().objects.create_user(
        email="user_a@test.com", password="Pass1234!"
    )


@pytest.fixture
def user_b(db):
    return get_user_model().objects.create_user(
        email="user_b@test.com", password="Pass1234!"
    )


@pytest.fixture
def superadmin_user(db):
    user = get_user_model().objects.create_user(
        email="superadmin@test.com", password="Pass1234!"
    )
    user.is_superadmin = True
    user.save()
    return user


@pytest.fixture
def org_user_a(user_a, org_a, default_role):
    return OrganizationUser.objects.create(user=user_a, org=org_a, role=default_role)


@pytest.fixture
def org_user_a_in_org_b(user_a, org_b, default_role):
    """UserA membership in Org B — separate membership row."""
    return OrganizationUser.objects.create(user=user_a, org=org_b, role=default_role)


@pytest.fixture
def org_user_b(user_b, org_a, default_role):
    return OrganizationUser.objects.create(user=user_b, org=org_a, role=default_role)


@pytest.fixture
def superadmin_org_user(superadmin_user, org_a, default_role):
    return OrganizationUser.objects.create(
        user=superadmin_user, org=org_a, role=default_role
    )


@pytest.fixture
def auth_client_a(user_a, org_user_a):
    """Client for user_a in org_a (single org → no header needed)."""
    client = APIClient()
    refresh = RefreshToken.for_user(user_a)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def auth_client_a_org_b(user_a, org_user_a, org_user_a_in_org_b):
    """Client for user_a explicitly targeting org_b via header."""
    client = APIClient()
    refresh = RefreshToken.for_user(user_a)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    client.defaults["HTTP_X_ORGANIZATION_ID"] = str(org_user_a_in_org_b.org_id)
    return client


@pytest.fixture
def auth_client_b(user_b, org_user_b):
    client = APIClient()
    refresh = RefreshToken.for_user(user_b)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def auth_client_superadmin(superadmin_user, superadmin_org_user):
    client = APIClient()
    refresh = RefreshToken.for_user(superadmin_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def anon_client():
    return APIClient()


@pytest.fixture
def flow_assistant(graph, llm_config):
    return FlowAssistant.objects.create(graph=graph, llm_config=llm_config)


@pytest.fixture
def conversation_a(flow_assistant, org_user_a):
    return FlowAssistantConversation.objects.create(
        flow_assistant=flow_assistant,
        organization_user=org_user_a,
        messages=[{"role": "system", "content": "You are the test flow."}],
    )


def _make_async_stream(*events):
    """Return an async generator that yields the given events."""

    async def _gen(messages, tools):
        for event in events:
            yield event

    return _gen


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_start_conversation_provisions_flow_assistant(
    graph, user_a, auth_client_a, org_user_a
):
    """POST without a prior FlowAssistant creates the row."""
    assert not FlowAssistant.objects.filter(graph=graph).exists()

    url = reverse("flow-assistant-conversations", kwargs={"graph_id": graph.pk})
    response = auth_client_a.post(url, {}, format="json")

    assert response.status_code == status.HTTP_201_CREATED, response.content
    assert "conversation_id" in response.data
    assert FlowAssistant.objects.filter(graph=graph).exists()
    conversation = FlowAssistantConversation.objects.get(
        pk=response.data["conversation_id"]
    )
    assert conversation.organization_user == org_user_a
    # System prompt should be seeded as the first message
    assert conversation.messages[0]["role"] == "system"


@pytest.mark.django_db
def test_send_message_returns_stream_url(conversation_a, auth_client_a, graph):
    """POST a message returns {stream_url} with a ticket parameter."""
    url = reverse(
        "flow-assistant-send-message",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    # Patch SseTicketService.issue to avoid real Redis
    with patch(
        "tables.views.flow_assistant_views.SseTicketService.issue",
        return_value=("test-ticket-123", 30),
    ):
        response = auth_client_a.post(url, {"message": "Hello!"}, format="json")

    assert response.status_code == status.HTTP_200_OK, response.content
    assert "stream_url" in response.data
    assert "test-ticket-123" in response.data["stream_url"]
    assert f"/conversations/{conversation_a.pk}/stream/" in response.data["stream_url"]

    # User message must be appended to conversation.messages
    conversation_a.refresh_from_db()
    user_msgs = [m for m in conversation_a.messages if m["role"] == "user"]
    assert user_msgs[-1]["content"] == "Hello!"


@pytest.mark.django_db
def test_get_node_redacts_secrets(graph, db):
    """get_node tool must redact api_key and token fields."""
    from tables.services.flow_assistant import get_node
    from tables.models.graph_models import CodeAgentNode

    node = CodeAgentNode.objects.create(
        graph=graph,
        node_name="secret_node",
        system_prompt="do stuff",
        stream_handler_code="",
    )

    result = get_node(graph.pk, str(node.pk))
    assert result.get("type") == "code_agent"
    # Any field with "api_key" in the name must be redacted
    config = result.get("config", {})
    for key, value in config.items():
        if (
            "api_key" in key.lower()
            or "secret" in key.lower()
            or "token" in key.lower()
        ):
            assert value == "***", f"Field '{key}' was not redacted: {value}"


@pytest.mark.django_db
def test_subflow_tool_overview_only(graph, db):
    """get_subflow returns name + description; no nodes/edges of the subgraph."""
    from tables.services.flow_assistant import get_subflow
    from tables.models.graph_models import SubGraphNode

    subgraph = Graph.objects.create(name="Child Flow", description="A child subflow.")
    sn = SubGraphNode.objects.create(
        graph=graph,
        subgraph=subgraph,
        node_name="sn_1",
    )

    result = get_subflow(graph.pk, str(sn.pk))
    assert result["name"] == "Child Flow"
    assert result["description"] == "A child subflow."
    # Must NOT contain node lists or edge lists
    assert "crew_node_list" not in result
    assert "edges" not in result
    assert "nodes" not in result


@pytest.mark.django_db
def test_permission_unauthenticated(graph, anon_client):
    """Anonymous requests must get 401."""
    url = reverse("flow-assistant-conversations", kwargs={"graph_id": graph.pk})
    response = anon_client.post(url, {}, format="json")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED, response.content


@pytest.mark.django_db
def test_conversation_belongs_to_org_user(conversation_a, auth_client_b, graph):
    """User B's client cannot access User A's conversation."""
    url = reverse(
        "flow-assistant-conversation",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    response = auth_client_b.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.content


@pytest.mark.django_db
def test_get_flow_overview(graph, db):
    """get_flow_overview returns correct shape."""
    from tables.services.flow_assistant import get_flow_overview

    result = get_flow_overview(graph.pk)
    assert result["name"] == graph.name
    assert result["description"] == graph.description
    assert "node_count_by_type" in result
    assert "edge_count" in result
    assert isinstance(result["subflows"], list)


@pytest.mark.django_db
def test_list_node_types_empty(graph, db):
    """list_node_types on an empty graph returns an empty list."""
    from tables.services.flow_assistant import list_node_types

    result = list_node_types(graph.pk)
    assert isinstance(result, list)
    assert len(result) == 0


# ── Org-scope tests ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_org_scope_user_a_in_org_b_sees_no_conversations(
    graph,
    flow_assistant,
    conversation_a,
    auth_client_a_org_b,
    org_user_a,
    org_user_a_in_org_b,
):
    """UserA in OrgB has a separate membership → org-B conversations list is empty."""
    url = reverse("flow-assistant-conversations", kwargs={"graph_id": graph.pk})
    response = auth_client_a_org_b.get(url)
    assert response.status_code == status.HTTP_200_OK, response.content
    # conversation_a belongs to org_user_a (OrgA), not org_user_a_in_org_b (OrgB)
    assert response.data["count"] == 0


@pytest.mark.django_db
def test_org_scope_user_a_in_org_a_sees_own_conversations(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """UserA in OrgA sees their own conversation in the list."""
    url = reverse("flow-assistant-conversations", kwargs={"graph_id": graph.pk})
    response = auth_client_a.get(url)
    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data["count"] == 1
    assert response.data["results"][0]["id"] == conversation_a.pk


# ── Soft-delete tests ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_soft_delete_keeps_row_with_deleted_at(conversation_a, auth_client_a, graph):
    """DELETE sets deleted_at; row is preserved in DB."""
    url = reverse(
        "flow-assistant-conversation",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    response = auth_client_a.delete(url)
    assert response.status_code == status.HTTP_204_NO_CONTENT, response.content

    conversation_a.refresh_from_db()
    assert conversation_a.deleted_at is not None


@pytest.mark.django_db
def test_soft_deleted_conversation_excluded_from_list(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """Soft-deleted conversations do not appear in the GET list."""
    # Soft-delete the conversation
    from django.utils import timezone

    conversation_a.deleted_at = timezone.now()
    conversation_a.save(update_fields=["deleted_at"])

    url = reverse("flow-assistant-conversations", kwargs={"graph_id": graph.pk})
    response = auth_client_a.get(url)
    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data["count"] == 0


@pytest.mark.django_db
def test_get_soft_deleted_conversation_returns_404(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """GET on a soft-deleted conversation returns 404 (not visible to the user)."""
    from django.utils import timezone

    conversation_a.deleted_at = timezone.now()
    conversation_a.save(update_fields=["deleted_at"])

    url = reverse(
        "flow-assistant-conversation",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    response = auth_client_a.get(url)
    assert response.status_code == status.HTTP_404_NOT_FOUND, response.content


# ── Audit endpoint tests ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_audit_endpoint_superadmin_can_list(
    graph, flow_assistant, conversation_a, auth_client_superadmin
):
    """Superadmin can access the audit endpoint and see conversations."""
    url = reverse("flow-assistant-audit-conversations")
    response = auth_client_superadmin.get(url)
    assert response.status_code == status.HTTP_200_OK, response.content
    assert response.data["count"] >= 1


@pytest.mark.django_db
def test_audit_endpoint_non_superadmin_gets_403(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """Non-superadmin users receive 403 from the audit endpoint."""
    url = reverse("flow-assistant-audit-conversations")
    response = auth_client_a.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN, response.content


@pytest.mark.django_db
def test_audit_endpoint_includes_deleted_when_requested(
    graph, flow_assistant, conversation_a, auth_client_superadmin
):
    """include_deleted=true shows soft-deleted rows."""
    from django.utils import timezone

    conversation_a.deleted_at = timezone.now()
    conversation_a.save(update_fields=["deleted_at"])

    url = reverse("flow-assistant-audit-conversations")
    response = auth_client_superadmin.get(url, {"include_deleted": "true"})
    assert response.status_code == status.HTTP_200_OK, response.content
    ids = [r["id"] for r in response.data["results"]]
    assert conversation_a.pk in ids


@pytest.mark.django_db
def test_audit_endpoint_excludes_deleted_by_default(
    graph, flow_assistant, conversation_a, auth_client_superadmin
):
    """Without include_deleted, soft-deleted rows are hidden from audit list."""
    from django.utils import timezone

    conversation_a.deleted_at = timezone.now()
    conversation_a.save(update_fields=["deleted_at"])

    url = reverse("flow-assistant-audit-conversations")
    response = auth_client_superadmin.get(url)
    assert response.status_code == status.HTTP_200_OK, response.content
    ids = [r["id"] for r in response.data["results"]]
    assert conversation_a.pk not in ids


# ── Title auto-derivation tests ───────────────────────────────────────────────


@pytest.mark.django_db
def test_title_derived_from_first_user_message(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """First user message causes title to be set on the conversation."""
    url = reverse(
        "flow-assistant-send-message",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    with patch(
        "tables.views.flow_assistant_views.SseTicketService.issue",
        return_value=("ticket-xyz", 30),
    ):
        response = auth_client_a.post(
            url,
            {"message": "Hello, what does this flow do?"},
            format="json",
        )

    assert response.status_code == status.HTTP_200_OK, response.content
    conversation_a.refresh_from_db()
    assert conversation_a.title != ""
    # Title should start with the message text (truncated)
    assert conversation_a.title.startswith("Hello")


@pytest.mark.django_db
def test_title_truncated_at_word_boundary():
    """_derive_title truncates at word boundary and appends ellipsis."""
    from tables.services.flow_assistant import _derive_title

    long_message = "Hello what does this flow do it seems very complicated"
    title = _derive_title(long_message)
    assert len(title) <= 52  # 50 chars + "…" is 1 char = 51 max; allow margin
    assert title.endswith("…")
    # No mid-word cut
    assert not title[:-1].endswith("-")


@pytest.mark.django_db
def test_title_not_overwritten_on_second_message(
    graph, flow_assistant, conversation_a, auth_client_a
):
    """Sending a second message does not change the already-set title."""
    conversation_a.title = "First title"
    conversation_a.save(update_fields=["title"])

    url = reverse(
        "flow-assistant-send-message",
        kwargs={"graph_id": graph.pk, "conversation_id": conversation_a.pk},
    )
    with patch(
        "tables.views.flow_assistant_views.SseTicketService.issue",
        return_value=("ticket-xyz2", 30),
    ):
        auth_client_a.post(
            url,
            {"message": "A completely different second message that is long enough"},
            format="json",
        )

    conversation_a.refresh_from_db()
    assert conversation_a.title == "First title"


# ── Async / streaming tests ───────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_stream_yields_tokens_and_done(
    graph, llm_config, user_a, org_a, default_role, db
):
    """stub LLM → [TokenEvent('hi'), DoneEvent()] → stream_reply yields them."""
    from tables.services.flow_assistant import FlowAssistantService
    from tables.models.flow_assistant_models import (
        FlowAssistant,
        FlowAssistantConversation,
    )
    from asgiref.sync import sync_to_async

    user_message = "what does this flow do?"

    org_user = await sync_to_async(OrganizationUser.objects.create)(
        user=user_a, org=org_a, role=default_role
    )
    assistant = await sync_to_async(FlowAssistant.objects.create)(
        graph=graph, llm_config=llm_config
    )
    conversation = await sync_to_async(FlowAssistantConversation.objects.create)(
        flow_assistant=assistant,
        organization_user=org_user,
        messages=[
            {"role": "system", "content": "sys"},
            {"role": "user", "content": user_message},
        ],
    )

    async def fake_stream(messages, tools):
        yield TokenEvent(content="hi")
        yield DoneEvent()

    with patch(
        "tables.services.flow_assistant.service.get_llm_client"
    ) as mock_get_client:
        mock_client = MagicMock()
        mock_client.stream_completion = fake_stream
        mock_get_client.return_value = mock_client

        service = FlowAssistantService()
        events = []
        async for event in service.stream_reply(conversation, user_message):
            events.append(event)

    types = [e.type for e in events]
    assert "token" in types
    assert types[-1] == "done"
    token_events = [e for e in events if e.type == "token"]
    assert token_events[0].content == "hi"


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_tool_call_roundtrip(graph, llm_config, user_a, org_a, default_role, db):
    """Stub LLM emits get_flow_overview tool call → service runs it → feeds result back."""
    from tables.services.flow_assistant import FlowAssistantService
    from tables.models.flow_assistant_models import (
        FlowAssistant,
        FlowAssistantConversation,
    )
    from tables.services.llm_clients.base import ToolCallEvent, DoneEvent, TokenEvent
    from asgiref.sync import sync_to_async

    user_message = "Tell me about this flow"

    org_user = await sync_to_async(OrganizationUser.objects.create)(
        user=user_a, org=org_a, role=default_role
    )
    assistant = await sync_to_async(FlowAssistant.objects.create)(
        graph=graph, llm_config=llm_config
    )
    conversation = await sync_to_async(FlowAssistantConversation.objects.create)(
        flow_assistant=assistant,
        organization_user=org_user,
        messages=[
            {"role": "system", "content": "sys"},
            {"role": "user", "content": user_message},
        ],
    )

    call_count = {"tool": 0, "final": 0}

    async def fake_stream_with_tool_call(messages, tools):
        # First call: emit tool call
        if call_count["tool"] == 0:
            call_count["tool"] += 1
            yield ToolCallEvent(id="call_1", name="get_flow_overview", args={})
            yield DoneEvent()
        else:
            # Second call (after tool result): emit final reply
            call_count["final"] += 1
            yield TokenEvent(content="This flow has 0 nodes.")
            yield DoneEvent()

    with patch(
        "tables.services.flow_assistant.service.get_llm_client"
    ) as mock_get_client:
        mock_client = MagicMock()
        mock_client.stream_completion = fake_stream_with_tool_call
        mock_get_client.return_value = mock_client

        service = FlowAssistantService()
        events = []
        async for event in service.stream_reply(conversation, user_message):
            events.append(event)

    # Tool call event must be in the stream
    tool_call_events = [e for e in events if e.type == "tool_call"]
    assert len(tool_call_events) == 1
    assert tool_call_events[0].name == "get_flow_overview"

    # Tool result event must be in the stream
    tool_result_events = [e for e in events if e.type == "tool_result"]
    assert len(tool_result_events) == 1

    # Final reply token must be present
    token_events = [e for e in events if e.type == "token"]
    assert any(
        "flow" in e.content.lower() or "nodes" in e.content.lower()
        for e in token_events
    )

    # Done event last
    assert events[-1].type == "done"

    # Conversation must be persisted with tool messages
    await sync_to_async(conversation.refresh_from_db)()
    roles = [m["role"] for m in conversation.messages]
    assert "tool" in roles
    assert "assistant" in roles


# ── Rich response format (structured output) tests ───────────────────────────


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_structured_output_event_emitted(
    graph, llm_config, user_a, org_a, default_role, db
):
    """LLM streams JSON tokens → service emits token deltas for `message` field
    plus one StructuredEvent at end-of-stream with the full payload."""
    from tables.services.flow_assistant import FlowAssistantService
    from tables.models.flow_assistant_models import (
        FlowAssistant,
        FlowAssistantConversation,
    )
    from asgiref.sync import sync_to_async

    user_message = "show me the nodes"

    org_user = await sync_to_async(OrganizationUser.objects.create)(
        user=user_a, org=org_a, role=default_role
    )
    assistant = await sync_to_async(FlowAssistant.objects.create)(
        graph=graph, llm_config=llm_config
    )
    conversation = await sync_to_async(FlowAssistantConversation.objects.create)(
        flow_assistant=assistant,
        organization_user=org_user,
        messages=[
            {"role": "system", "content": "sys"},
            {"role": "user", "content": user_message},
        ],
    )

    # Simulate the model streaming JSON character by character.
    json_response = '{"message": "hi", "ef_tables": [], "action_message": []}'
    json_tokens = list(json_response)

    async def fake_stream(messages, tools):
        for char in json_tokens:
            yield TokenEvent(content=char)
        yield DoneEvent()

    with patch(
        "tables.services.flow_assistant.service.get_llm_client"
    ) as mock_get_client:
        mock_client = MagicMock()
        mock_client.stream_completion = fake_stream
        mock_get_client.return_value = mock_client

        service = FlowAssistantService()
        events = []
        async for event in service.stream_reply(conversation, user_message):
            events.append(event)

    # Should have token events carrying the message field delta.
    token_events = [e for e in events if e.type == "token"]
    assert len(token_events) > 0
    full_streamed_text = "".join(e.content for e in token_events)
    assert full_streamed_text == "hi"

    # Should have exactly one StructuredEvent before DoneEvent.
    structured_events = [e for e in events if e.type == "structured"]
    assert len(structured_events) == 1
    structured = structured_events[0]
    assert structured.message == "hi"
    assert structured.ef_tables == []
    assert structured.action_message == []

    # DoneEvent must be last.
    assert events[-1].type == "done"

    # StructuredEvent must come before DoneEvent.
    structured_idx = next(i for i, e in enumerate(events) if e.type == "structured")
    done_idx = next(i for i, e in enumerate(events) if e.type == "done")
    assert structured_idx < done_idx


@pytest.mark.parametrize(
    "buffer, expected",
    [
        # Empty buffer
        ("", ""),
        # Key not yet present
        ('{"messa', ""),
        # Key present, no colon yet
        ('{"message"', ""),
        # Key + colon, no opening quote
        ('{"message": ', ""),
        # Key + opening quote, no content yet
        ('{"message": "', ""),
        # Partial value
        ('{"message": "hi', "hi"),
        # Complete value, no closing brace
        ('{"message": "hi"', "hi"),
        # Complete value in full object
        ('{"message": "hi"}', "hi"),
        # Newline escape
        ('{"message": "hi\\nthere"}', "hi\nthere"),
        # Quote escape
        ('{"message": "with \\"quote\\""}', 'with "quote"'),
        # Backslash escape
        ('{"message": "back\\\\slash"}', "back\\slash"),
        # Value followed by other fields
        ('{"message": "done", "ef_tables": []}', "done"),
        # Empty message value
        ('{"message": ""}', ""),
    ],
)
def test_partial_json_extract_message_field(buffer, expected):
    """Unit tests for the partial-JSON message field extractor."""
    from tables.services.flow_assistant import extract_message_field

    assert extract_message_field(buffer) == expected


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_action_message_persisted(
    graph, llm_config, user_a, org_a, default_role, db
):
    """Structured response with action_message → assistant message in
    conversation.messages retains the action_message field after persist."""
    from tables.services.flow_assistant import FlowAssistantService
    from tables.models.flow_assistant_models import (
        FlowAssistant,
        FlowAssistantConversation,
    )
    from asgiref.sync import sync_to_async

    user_message = "what should I look at next?"

    org_user = await sync_to_async(OrganizationUser.objects.create)(
        user=user_a, org=org_a, role=default_role
    )
    assistant = await sync_to_async(FlowAssistant.objects.create)(
        graph=graph, llm_config=llm_config
    )
    conversation = await sync_to_async(FlowAssistantConversation.objects.create)(
        flow_assistant=assistant,
        organization_user=org_user,
        messages=[
            {"role": "system", "content": "sys"},
            {"role": "user", "content": user_message},
        ],
    )

    action_items = [{"type": "prompt", "text": "Tell me about the nodes"}]
    json_response = (
        '{"message": "Here is a suggestion.", '
        '"ef_tables": [], '
        '"action_message": [{"type": "prompt", "text": "Tell me about the nodes"}]}'
    )

    async def fake_stream(messages, tools):
        yield TokenEvent(content=json_response)
        yield DoneEvent()

    with patch(
        "tables.services.flow_assistant.service.get_llm_client"
    ) as mock_get_client:
        mock_client = MagicMock()
        mock_client.stream_completion = fake_stream
        mock_get_client.return_value = mock_client

        service = FlowAssistantService()
        events = []
        async for event in service.stream_reply(conversation, user_message):
            events.append(event)

    # Verify the assistant message was persisted with action_message field.
    await sync_to_async(conversation.refresh_from_db)()
    assistant_msgs = [m for m in conversation.messages if m.get("role") == "assistant"]
    assert len(assistant_msgs) == 1
    persisted = assistant_msgs[0]
    assert persisted["content"] == "Here is a suggestion."
    assert persisted.get("action_message") == action_items


# ── _messages_for_llm unit tests ─────────────────────────────────────────────


@pytest.mark.django_db
def test_messages_for_llm_evicts_prior_turn_tool_results():
    from tables.services.flow_assistant.service import _messages_for_llm

    messages = [
        {"role": "system", "content": "You are..."},
        {"role": "user", "content": "inspect the flow"},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "get_flow_overview", "arguments": "{}"},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_1",
            "name": "get_flow_overview",
            "content": '{"nodes": [{"id": 1, "name": "start"}, ...long body...]}',
        },
        {"role": "assistant", "content": '{"message": "Found 5 nodes."}'},
        {"role": "user", "content": "tell me about node 1"},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {"name": "get_node", "arguments": '{"node_id": 1}'},
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_2",
            "name": "get_node",
            "content": '{"id": 1, "config": {...}}',
        },
    ]
    result = _messages_for_llm(messages)
    # Turn 1's tool result is stubbed
    assert result[3]["content"].startswith("[tool result from an earlier turn")
    assert "get_flow_overview" in result[3]["content"]
    assert result[3]["tool_call_id"] == "call_1"  # other fields preserved
    # Turn 2's tool result (current turn) untouched
    assert result[7]["content"] == messages[7]["content"]
    # Non-tool messages untouched
    for i in (0, 1, 2, 4, 5, 6):
        assert result[i] == messages[i]


@pytest.mark.django_db
def test_messages_for_llm_is_idempotent():
    from tables.services.flow_assistant.service import _messages_for_llm

    messages = [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "a"},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "c",
                    "type": "function",
                    "function": {"name": "get_flow_overview", "arguments": "{}"},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c", "name": "get_flow_overview", "content": "<big>"},
        {"role": "assistant", "content": "{}"},
        {"role": "user", "content": "b"},
    ]
    once = _messages_for_llm(messages)
    twice = _messages_for_llm(once)
    assert once == twice


@pytest.mark.django_db
def test_messages_for_llm_no_user_message_returns_copy():
    from tables.services.flow_assistant.service import _messages_for_llm

    messages = [{"role": "system", "content": "..."}]
    result = _messages_for_llm(messages)
    assert result == messages
    assert result is not messages  # must be a copy


@pytest.mark.django_db
def test_messages_for_llm_truncates_long_args():
    from tables.services.flow_assistant.service import _messages_for_llm

    long_args = '{"x": "' + ("a" * 500) + '"}'
    messages = [
        {"role": "system", "content": "..."},
        {"role": "user", "content": "a"},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "c",
                    "type": "function",
                    "function": {"name": "load_skill", "arguments": long_args},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c", "name": "load_skill", "content": "<big>"},
        {"role": "assistant", "content": "{}"},
        {"role": "user", "content": "b"},
    ]
    result = _messages_for_llm(messages)
    stub = result[3]["content"]
    assert "…" in stub  # truncation marker present
    assert len(stub) < 500  # stub itself stays small (longer fixed prefix, but bounded)


# ── Tool-call SSE enrichment test ─────────────────────────────────────────────


@pytest.mark.django_db
def test_tool_call_enrichment_helpers(graph, db):
    """resolve_node_display_name returns the node name; returns None for unknown nodes."""
    from tables.models.graph_models import CodeAgentNode
    from tables.services.flow_assistant import (
        _build_node_index,
        resolve_node_display_name,
        resolve_subgraph_display_name,
    )

    node = CodeAgentNode.objects.create(
        graph=graph,
        node_name="my_agent_node",
        system_prompt="do stuff",
        stream_handler_code="",
    )

    # Without pre-built index — builds internally
    name = resolve_node_display_name(graph.pk, node.pk)
    assert name == "my_agent_node"

    # With pre-built index
    index = _build_node_index(graph.pk)
    name2 = resolve_node_display_name(graph.pk, node.pk, node_index=index)
    assert name2 == "my_agent_node"

    # Unknown node
    assert resolve_node_display_name(graph.pk, 99999) is None

    # Subgraph name helper
    from tables.models.graph_models import SubGraphNode

    subgraph = Graph.objects.create(name="Sub Flow", description="desc")
    sn = SubGraphNode.objects.create(graph=graph, subgraph=subgraph, node_name="sg1")
    assert resolve_subgraph_display_name(graph.pk, sn.pk) == "Sub Flow"
    assert resolve_subgraph_display_name(graph.pk, 99999) is None


# ── Decision-table decision_rules serialization tests ─────────────────────────


@pytest.mark.django_db
def test_get_node_decision_table_includes_decision_rules(graph, db):
    """get_node for a DecisionTableNode must include a human-readable decision_rules list.

    The list must expose rule names, condition expressions, and routing targets
    so the LLM can reason about branching without additional tool calls.
    """
    from tables.models.graph_models import Condition, ConditionGroup, DecisionTableNode
    from tables.services.flow_assistant import get_node

    node = DecisionTableNode.objects.create(
        graph=graph,
        node_name="budget_check",
        default_next_node_id=None,
        next_error_node_id=None,
    )
    # Rule 1: high-value order
    group_high = ConditionGroup.objects.create(
        decision_table_node=node,
        group_name="high_value_order",
        group_type="simple",
        order=0,
        next_node_id=None,
    )
    Condition.objects.create(
        condition_group=group_high,
        condition_name="amount_check",
        order=0,
        condition="amount > 10000",
    )
    # Rule 2: missing budget code
    group_missing = ConditionGroup.objects.create(
        decision_table_node=node,
        group_name="missing_budget_code",
        group_type="simple",
        order=1,
        next_node_id=None,
    )
    Condition.objects.create(
        condition_group=group_missing,
        condition_name="budget_code_absent",
        order=0,
        condition="budget_code == null",
    )

    result = get_node(graph.pk, str(node.pk))

    assert result.get("type") == "decision_table"
    assert "decision_rules" in result, "decision_rules key missing from get_node response"

    rules = result["decision_rules"]
    assert isinstance(rules, list)
    assert len(rules) == 2

    rule_names = [r["rule_name"] for r in rules]
    assert "high_value_order" in rule_names
    assert "missing_budget_code" in rule_names

    # Each rule must carry human-readable condition expressions
    for rule in rules:
        assert "conditions" in rule, f"Rule {rule['rule_name']} missing conditions"
        assert len(rule["conditions"]) >= 1
        cond = rule["conditions"][0]
        assert "name" in cond
        assert "expression" in cond
        # expression must be a non-empty string — not a hash or id
        assert isinstance(cond["expression"], str) and len(cond["expression"]) > 0

    # Spot-check: high_value_order condition expression is readable
    high_rule = next(r for r in rules if r["rule_name"] == "high_value_order")
    assert high_rule["conditions"][0]["expression"] == "amount > 10000"


@pytest.mark.django_db
def test_get_node_classification_decision_table_includes_decision_rules(graph, db):
    """get_node for a ClassificationDecisionTableNode must include decision_rules.

    Each rule must expose its name, expression, route_code, and routing target.
    """
    from tables.models.graph_models import (
        ClassificationConditionGroup,
        ClassificationDecisionTableNode,
    )
    from tables.services.flow_assistant import get_node

    node = ClassificationDecisionTableNode.objects.create(
        graph=graph,
        node_name="sentiment_router",
        default_next_node_id=None,
        next_error_node_id=None,
    )
    ClassificationConditionGroup.objects.create(
        classification_decision_table_node=node,
        group_name="positive_sentiment",
        order=0,
        expression="sentiment_score > 0.7",
        route_code="pos",
        next_node_id=None,
    )
    ClassificationConditionGroup.objects.create(
        classification_decision_table_node=node,
        group_name="negative_sentiment",
        order=1,
        expression="sentiment_score < 0.3",
        route_code="neg",
        next_node_id=None,
    )

    result = get_node(graph.pk, str(node.pk))

    assert result.get("type") == "classification_decision_table"
    assert "decision_rules" in result, "decision_rules key missing from get_node response"

    rules = result["decision_rules"]
    assert isinstance(rules, list)
    assert len(rules) == 2

    rule_names = [r["rule_name"] for r in rules]
    assert "positive_sentiment" in rule_names
    assert "negative_sentiment" in rule_names

    pos_rule = next(r for r in rules if r["rule_name"] == "positive_sentiment")
    assert pos_rule["route_code"] == "pos"
    assert pos_rule["expression"] == "sentiment_score > 0.7"


@pytest.mark.django_db
def test_get_node_non_decision_type_has_no_decision_rules(graph, db):
    """get_node for non-decision nodes must NOT include a decision_rules key."""
    from tables.models.graph_models import CodeAgentNode
    from tables.services.flow_assistant import get_node

    node = CodeAgentNode.objects.create(
        graph=graph,
        node_name="plain_agent",
        system_prompt="do stuff",
        stream_handler_code="",
    )
    result = get_node(graph.pk, str(node.pk))
    assert "decision_rules" not in result
