from __future__ import annotations

"""
FlowAssistantService — the service layer for the Flow Assistant feature.

Responsibilities:
  - Provisioning FlowAssistant rows (get_or_create)
  - Generating the persona system prompt from flow metadata
  - Starting conversations
  - Running the LLM reply loop with tool-calling support
"""

import json
import re
from typing import AsyncIterator

from asgiref.sync import sync_to_async
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.utils import timezone

from utils.logger import logger

from tables.models.flow_assistant_models import FlowAssistant, FlowAssistantConversation
from .output_schema import FLOW_ASSISTANT_OUTPUT_SCHEMA
from tables.services.llm_clients import (
    DoneEvent,
    StreamEvent,
    StructuredEvent,
    TokenEvent,
    ToolCallEvent,
    ToolResultEvent,
    ToolSpec,
    UnsupportedLLMProviderError,
    get_llm_client,
)
from . import tools as _tools
from . import partial_json as _partial_json
from .tools import _NODE_TABLES


# ── Domain exceptions ─────────────────────────────────────────────────────────


class LLMConfigMissingError(Exception):
    """Raised when a FlowAssistant has no llm_config set."""


class LLMConfigInvalidError(Exception):
    """Raised when the llm_config is misconfigured (e.g. unsupported provider)."""


class ToolExecutionError(Exception):
    """Raised when a tool function raises an unexpected exception."""


# ── Tool registry ─────────────────────────────────────────────────────────────

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="get_flow_overview",
        description=(
            "Returns a high-level overview of the current flow: its name, description, "
            "node count by type, the full list of nodes (id + type + name only), "
            "total edge count, and a list of direct subflows (name + description only, "
            "no internal details). Use this when asked to enumerate or look up nodes."
        ),
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
    ToolSpec(
        name="get_node",
        description=(
            "Returns the configuration and connectivity of a single node in the flow. "
            "Sensitive fields (api_key, secret, token) are redacted. "
            "For decision_table and classification_decision_table nodes, the response "
            "includes `decision_rules` with the full branching logic. "
            "For llm and code_agent nodes, the response includes `llm_config_summary` "
            "with provider, model, and temperature. "
            "For crew nodes, the response includes `crew_summary` with agents and tasks. "
            "For python and webhook_trigger nodes, the response includes "
            "`python_code_summary` with the actual code body, entrypoint, and library "
            "list — use it to answer questions about what the node does, which APIs it "
            "calls, and what libraries it depends on. "
            "Provide the numeric node ID as a string."
        ),
        parameters={
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "The numeric ID of the node (e.g. '42').",
                }
            },
            "required": ["node_id"],
        },
    ),
    ToolSpec(
        name="get_subflow",
        description=(
            "Returns the name, description, and subgraph_graph_id of the target "
            "subgraph referenced by a SubGraphNode. Use the returned subgraph_graph_id "
            "with get_flow_overview(subgraph_graph_id) to introspect the subflow's nodes "
            "recursively. Cite the subflow by name when discussing its internals. "
            "Provide the numeric SubGraphNode ID as a string."
        ),
        parameters={
            "type": "object",
            "properties": {
                "subgraph_node_id": {
                    "type": "string",
                    "description": "The numeric ID of the SubGraphNode row.",
                }
            },
            "required": ["subgraph_node_id"],
        },
    ),
    ToolSpec(
        name="get_edges_from",
        description="Returns the outgoing edges from a node (what nodes it leads to).",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "The numeric ID of the source node.",
                }
            },
            "required": ["node_id"],
        },
    ),
    ToolSpec(
        name="get_edges_to",
        description="Returns the incoming edges to a node (what nodes lead to it).",
        parameters={
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "The numeric ID of the target node.",
                }
            },
            "required": ["node_id"],
        },
    ),
    ToolSpec(
        name="list_node_types",
        description="Returns the distinct node type tokens used in this flow.",
        parameters={
            "type": "object",
            "properties": {},
            "required": [],
        },
    ),
    ToolSpec(
        name="list_skills",
        description=(
            "List available EpicStaff knowledge skills. Each entry has a slug and a "
            "short description of when to use that skill. Call this when you need "
            "deeper context about EpicStaff flow concepts, node types, debugging, "
            "or design principles than the inline system prompt provides. "
            "After deciding which skill applies, call load_skill(name=<slug>)."
        ),
        parameters={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="load_skill",
        description=(
            "Load the full content of one EpicStaff knowledge skill by its slug "
            "(as returned by list_skills). The body is a self-contained markdown "
            "document. Use this only after consulting list_skills — do not guess slugs. "
            "Each skill is several thousand tokens, so load only the one you need."
        ),
        parameters={
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Skill slug from list_skills",
                },
            },
            "required": ["name"],
            "additionalProperties": False,
        },
    ),
    ToolSpec(
        name="get_recent_sessions",
        description=(
            "Returns the most recent EXECUTION sessions for this flow (not Flow "
            "Assistant chat conversations). Use this when asked whether the flow "
            "has run recently, whether the last run succeeded, how often it runs, "
            "or what errors occurred. Each entry has status, timestamps, duration, "
            "has_error, entrypoint, and start_variables. "
            "limit defaults to 5, maximum 25."
        ),
        parameters={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of recent sessions to return (1–25, default 5).",
                    "default": 5,
                }
            },
            "required": [],
        },
    ),
    ToolSpec(
        name="get_session_detail",
        description=(
            "Returns per-node execution trace metadata (timings and status) for one "
            "EXECUTION session of this flow. Use this to investigate a specific failure "
            "after calling get_recent_sessions. Returns node_name, execution order, "
            "and timestamps per node — NO message bodies or content text. "
            "Provide the numeric session ID (from get_recent_sessions output)."
        ),
        parameters={
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "integer",
                    "description": "The numeric ID of the session to inspect.",
                }
            },
            "required": ["session_id"],
        },
    ),
]

# Map tool name → callable(graph_id, **kwargs)
_TOOL_CALLABLES: dict[str, callable] = {
    "get_flow_overview": lambda graph_id, **_: _tools.get_flow_overview(graph_id),
    "get_node": lambda graph_id, node_id, **_: _tools.get_node(graph_id, node_id),
    "get_subflow": lambda graph_id, subgraph_node_id, **_: _tools.get_subflow(
        graph_id, subgraph_node_id
    ),
    "get_edges_from": lambda graph_id, node_id, **_: _tools.get_edges_from(
        graph_id, node_id
    ),
    "get_edges_to": lambda graph_id, node_id, **_: _tools.get_edges_to(
        graph_id, node_id
    ),
    "list_node_types": lambda graph_id, **_: _tools.list_node_types(graph_id),
    # Skill tools are graph-independent; graph_id is accepted but ignored.
    "list_skills": lambda _graph_id, **__: _tools.list_skills(),
    "load_skill": lambda _graph_id, name, **__: _tools.load_skill(name),
    # Session tools are org-scoped by graph_id inside the tool implementation.
    "get_recent_sessions": lambda graph_id, limit=5, **_: _tools.get_recent_sessions(
        graph_id, limit=int(limit)
    ),
    "get_session_detail": lambda graph_id, session_id, **_: _tools.get_session_detail(
        graph_id, int(session_id)
    ),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

_TITLE_MAX_CHARS = 50
_MAX_TOOL_ITERATIONS = 10  # hard cap on tool-call rounds per user turn

_MD_TABLE_PATTERN = re.compile(
    r"(?:^|\n)"  # start of line
    r"\|[^\n]*\|\s*\n"  # header row with pipes
    r"\|[\s\-:|]+\|\s*\n"  # separator row like |---|---|
    r"(?:\|[^\n]*\|\s*\n?)*",  # zero or more body rows
    re.MULTILINE,
)


def _strip_markdown_tables(text: str) -> str:
    """Remove GitHub-flavored markdown tables from text.

    Defensive — the system prompt instructs the LLM to put table data only in
    `ef_tables`, but it drifts. We strip duplicates at persistence time so
    stored conversations don't show the same data twice when re-opened.
    """
    cleaned = _MD_TABLE_PATTERN.sub("\n", text)
    # Collapse 3+ consecutive newlines to two
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _derive_title(message: str) -> str:
    """Truncate message to at most 50 characters at a word boundary, append '…' if truncated."""
    text = message.strip()
    if len(text) <= _TITLE_MAX_CHARS:
        return text
    truncated = text[:_TITLE_MAX_CHARS]
    # Walk back to the last whitespace so we don't cut mid-word.
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated + "…"


def _messages_for_llm(messages: list[dict]) -> list[dict]:
    """Return a copy of `messages` with stale tool_results stubbed.

    "Stale" = any tool message preceding the last user message (i.e., from a
    prior turn). The current turn's tool results stay intact because the LLM
    may be mid multi-tool-call loop.

    Eviction is safe only because every Flow Assistant tool is a pure,
    idempotent read. If a future tool has side effects or non-deterministic
    output, exclude it from eviction (or add a per-tool whitelist).
    """
    # Find the index of the last user message.
    last_user_idx = -1
    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            last_user_idx = i

    # No user message or it's the very first message — return a plain copy.
    if last_user_idx <= 0:
        return list(messages)

    # Build tool_call_id → (name, args_str) from assistant messages before the last user turn.
    call_map: dict[str, tuple[str, str]] = {}
    for msg in messages[:last_user_idx]:
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            for tc in msg["tool_calls"]:
                tc_id = tc.get("id", "")
                fn = tc.get("function", {})
                call_map[tc_id] = (fn.get("name", ""), fn.get("arguments", ""))

    # Build output list, stubbing stale tool messages.
    result: list[dict] = []
    for i, msg in enumerate(messages):
        if i >= last_user_idx or msg.get("role") != "tool":
            result.append(msg)
            continue

        content = msg.get("content", "")
        if isinstance(content, str) and content.startswith(
            "[tool result from an earlier turn"
        ):
            # Already stubbed — idempotent pass-through.
            result.append(msg)
            continue

        tc_id = msg.get("tool_call_id", "")
        if tc_id not in call_map:
            # Defensive: unknown call id — pass through unchanged.
            result.append(msg)
            continue

        name, args = call_map[tc_id]
        args_display = args if len(args) <= 200 else args[:200] + "…"
        stub = (
            f"[tool result from an earlier turn was omitted to save context. "
            f"tool: {name}, args: {args_display}. "
            f"The assistant already used this result; do not re-call unless the user "
            f"explicitly asks for fresh data.]"
        )
        result.append({**msg, "content": stub})

    return result


# ── Rich-response format guidance (lifted from epicchat-response/SKILL.md) ────
#
# Inlined here rather than read at runtime to avoid brittle file-path coupling.
# Adapted for the Flow Assistant: "Build mode" toggle and processTables action
# are excluded (Code-Agent-specific); navigation guidance for "after creating /
# modifying flows" is dropped (this assistant is read-only), but the openFlow /
# openNode / refreshCache action verbs are retained as available actions.
#
# Update this string when the EpicChat response skill evolves.

_RICH_FORMAT_GUIDANCE = """\
Your output is rendered by a structured-response widget. Follow this format:

Return a JSON object with the following fields. Only include fields you need —
`message` is the only required field.

### `message` (string, required)
Main chat reply. Full Markdown supported (headings, bold, code blocks, lists,
links). Keep it focused — don't repeat data that's already in a table.

### `ef_tables` (array, optional)
Interactive data tables rendered below the message. STRICT RULE: when you
include `ef_tables`, the `message` field MUST NOT contain the same rows as
a markdown table or as a textual list. Use `message` for narrative summary
only (e.g. "Found 3 servers with high CPU:") and put the actual rows in
`ef_tables`. Duplicating the data shows it twice to the user.

Minimal — just rows, columns auto-detected:
  {"ef_tables": [{"rows": [{"name": "Alice", "score": 95}, {"name": "Bob", "score": 72}]}]}

With options:
  {"ef_tables": [{"columns": [{"key": "name", "title": "Name"}, {"key": "type", "title": "Type"}], "rows": [{"name": "customer_intake", "type": "crew"}], "isEditable": false, "isSortable": true}]}

Column options: `key`, `title`, `type` ("text" | "number" | "boolean" | "date"), `visible`, `editable`.
Table options: `id`, `isEditable` (default true), `isSortable` (default true), `defaultSortField`, `rowsSelectionType` ("edit" | "select" | "multiSelect").

### `action_message` (array, optional)
Interactive elements displayed with the message.

  [
    {"type": "button", "action": "sendAction", "text": "Do something"},
    {"type": "link", "action": "link", "text": "Open docs", "params": {"url": "https://..."}},
    {"type": "prompt", "text": "What about the subflows?"}
  ]

| type   | behavior |
|--------|----------|
| button | Clickable button below message. Removed after click. |
| link   | Opens params.url in browser. |
| prompt | Suggestion chip in input footer. Clicking sends text as new user message. |

### Action identifiers

| action                   | when to use |
|--------------------------|-------------|
| sendAction               | Default for buttons. Sends text as user_action. |
| sendButtonTextWithParams | Like sendAction but also sends params as context extras. |
| link                     | Opens params.url in browser. |
| openFlow                 | Navigates to a flow. Requires params: {"flowId": "<id>"}. |
| openNode                 | Opens a node panel. Requires params: {"flowId": "<id>", "nodeId": "<uuid>"}. |
| refreshCache             | Reloads the page to pick up flow/node changes. |

### Prompt suggestions
Add 2–3 prompt chips when there are natural follow-up questions:
  {"type": "prompt", "text": "Show me the node config for customer_intake"}
  {"type": "prompt", "text": "What subflows does this flow depend on?"}

### Combined example
{
  "message": "This flow has **3 nodes**:",
  "ef_tables": [{
    "rows": [
      {"id": 1, "type": "crew", "name": "customer_intake"},
      {"id": 2, "type": "llm", "name": "summarize"},
      {"id": 3, "type": "end", "name": "end"}
    ],
    "isEditable": false,
    "isSortable": true
  }],
  "action_message": [
    {"type": "button", "action": "openNode", "text": "Open customer_intake", "params": {"flowId": "55", "nodeId": "<uuid>"}},
    {"type": "prompt", "text": "Tell me about the summarize node"},
    {"type": "prompt", "text": "What subflows are used here?"}
  ]
}

### Guidelines
- **Never duplicate table data.** When you emit `ef_tables`, the `message` field
  contains ONLY a short prose summary — never a markdown table, never a
  bulleted list of the row contents. The widget renders the data from
  `ef_tables`; the message provides narrative context around it.
- **One representation per dataset.** If you choose to describe the data
  inline in the message (as a markdown table or bulleted list), DO NOT also
  emit `ef_tables`. Pick one or the other.
- Be concise. Keep `message` focused. Don't repeat data that's already in a table.
- Use tables for structured data. Lists of nodes, edges — put them in `ef_tables`.
- Offer prompts. After answering, suggest 2–3 natural follow-ups as prompt chips.
- Minimal fields. Don't include `ef_tables` or `action_message` if you don't need them.
"""


# ── Service ───────────────────────────────────────────────────────────────────


class FlowAssistantService:
    """Service for the Flow Assistant feature.

    Not a singleton — each request may instantiate a fresh one; the service is
    stateless beyond what's passed to its methods.
    """

    def get_or_create(self, graph_id: int) -> FlowAssistant:
        """Return the FlowAssistant for graph_id, creating it lazily if missing.

        Raises Graph.DoesNotExist if the graph does not exist.
        """
        from tables.models.graph_models import Graph

        graph = Graph.objects.get(pk=graph_id)
        assistant, _ = FlowAssistant.objects.get_or_create(graph=graph)
        return assistant

    def build_system_prompt(self, flow_assistant: FlowAssistant) -> str:
        """Generate the persona system prompt from live flow metadata.

        Always builds from current graph data — no caching so node additions
        are visible immediately per conversation.start.
        """
        graph = flow_assistant.graph

        # Node counts via single query per related manager
        node_counts: dict[str, int] = {}
        related_managers = [
            ("crew", "crew_node_list"),
            ("python", "python_node_list"),
            ("llm", "llm_node_list"),
            ("file_extractor", "file_extractor_node_list"),
            ("audio_transcription", "audio_transcription_node_list"),
            ("subgraph", "subgraph_node_list"),
            ("code_agent", "code_agent_node_list"),
            ("start", "start_node_list"),
            ("end", "end_node"),
            ("decision_table", "decision_table_node_list"),
            (
                "classification_decision_table",
                "classification_decision_table_node_list",
            ),
            ("webhook_trigger", "webhook_trigger_node_list"),
            ("telegram_trigger", "telegram_trigger_node_list"),
        ]
        for label, rel in related_managers:
            manager = getattr(graph, rel, None)
            if manager is not None:
                count = manager.count()
                if count:
                    node_counts[label] = count

        subflows = [
            f"  - {sn.subgraph.name}: {sn.subgraph.description}"
            for sn in graph.subgraph_node_list.select_related("subgraph").all()
            if sn.subgraph
        ]

        node_summary_lines = [
            f"  - {label}: {count}" for label, count in node_counts.items()
        ]
        node_summary = (
            "\n".join(node_summary_lines) if node_summary_lines else "  (none)"
        )
        subflow_summary = "\n".join(subflows) if subflows else "  (none)"
        description = graph.description or "(no description provided)"

        # Build "Nodes in this flow" list — up to 30 entries, sorted by (type, id).
        node_tuples: list[tuple[str, int, str]] = []
        for node_type, model_cls, has_db_node_name in _NODE_TABLES:
            fields = ["id", "node_name"] if has_db_node_name else ["id"]
            for node in model_cls.objects.filter(graph_id=graph.pk).only(*fields):
                node_tuples.append((node_type, node.pk, getattr(node, "node_name", "")))
        node_tuples.sort(key=lambda t: (t[0], t[1]))

        _MAX_NODES_IN_PROMPT = 30
        if not node_tuples:
            nodes_section = "Nodes in this flow:\n  (none)"
        else:
            visible = node_tuples[:_MAX_NODES_IN_PROMPT]
            remainder = len(node_tuples) - len(visible)
            lines = [
                f'  - id={node_id} type={node_type} name="{name}"'
                for node_type, node_id, name in visible
            ]
            if remainder:
                lines.append(
                    f"  ... ({remainder} more — call the get_flow_overview tool to see all)"
                )
            nodes_section = "Nodes in this flow:\n" + "\n".join(lines)

        return (
            f"You are the AI assistant for the '{graph.name}' flow.\n\n"
            f"Flow description: {description}\n\n"
            f"This flow contains the following node types:\n{node_summary}\n\n"
            f"{nodes_section}\n\n"
            f"Direct subflows (children) used by this flow:\n{subflow_summary}\n\n"
            "Your role:\n"
            "- Speak in first person on behalf of this flow, as if you ARE the flow.\n"
            "- Be friendly, concise, and accurate.\n"
            "- You are an AI assistant — be transparent about that when asked.\n"
            "- You can answer questions about the flow's purpose, its nodes, and its subflows.\n"
            "- When asked about a specific node by name or role, call the `get_flow_overview` tool to retrieve the current list of node IDs and names, then call `get_node(node_id)` for details.\n"
            "- You can introspect subflows recursively — call `get_subflow` first to get the subgraph_graph_id, then `get_flow_overview(subgraph_graph_id)` for its nodes. Cite the subflow by name when discussing its internals.\n"
            "- When asked about a Crew node (sometimes called a Project), call `get_node` on the CrewNode — it returns `crew_summary` with the crew's purpose, agents, and tasks at description level. You can describe what the crew does without revealing internal prompts or backstories.\n"
            "- For Python nodes and webhook triggers, the returned `python_code_summary` contains the actual code, entrypoint, and library list — use it to answer questions about what the node does, which APIs it calls, what libraries it depends on.\n"
            "- When asked about whether you've run, errors, or recent activity, call `get_recent_sessions`. For a specific failure, follow up with `get_session_detail(session_id)`. Note: these are EXECUTION sessions, not Flow Assistant chat conversations.\n"
            "- This is a read-only assistant: you cannot modify the flow.\n"
            "\n"
            "You have direct read access to this flow via the tools listed below. "
            "When the user asks to 'inspect', 'QA', 'review', 'audit', 'check', 'lint', "
            "or otherwise examine the flow, you MUST use your own tools to do the work — "
            "do not tell the user to run commands themselves, and do not reference any MCP "
            "tools or external CLI tools by name (e.g. `run_qa`, `inspect_session`, "
            "`flow_get_connections` — none of these exist here). "
            "For an inspection-style request: start with `get_flow_overview`, then drill "
            "into specific nodes with `get_node` and trace wiring with `get_edges_from` / "
            "`get_edges_to`. If you need a methodology for the audit, call "
            "`load_skill(name='flow-qa')` to load the static-check checklist — then APPLY "
            "it using your own tools (substitute your tool names anywhere the skill "
            "references MCP tools).\n"
            "\n"
            "When the user asks a persona-level question, answer like a domain employee — not a graph viewer:\n"
            "\n"
            '- **"What do you do?" / "Who are you?"** → Synthesize a 2-3 sentence job description from your name, description, and the roles of your major nodes (call get_flow_overview if you haven\'t already). Don\'t enumerate nodes by id. Example: "I\'m the purchase agent. I take requisition requests, validate them against budget rules, route to the right approver, and place the order with the supplier."\n'
            "\n"
            '- **"How do you handle [a specific case]?"** → Trace your own decision path. Start with the entry point (call get_node on the start/trigger nodes), follow get_edges_from to the next node, and continue until you reach an end node or a branch relevant to the case. When you encounter a decision-table or code node that branches on the case the user described, cite the rule: "If the request has no budget code, the budget_check decision table routes to the fallback branch and sends it to the finance team." If the case isn\'t explicitly handled, say so plainly: "I don\'t have a rule for that — it would fall through to my default branch which goes to X."\n'
            "\n"
            '- **"What would you refuse to do?" / "What\'s outside your scope?"** → Define your mandate by what you DON\'T do. Look at: (1) capabilities NOT in the node set ("I don\'t authenticate the requester — there\'s no auth node in my flow"), (2) default/error branches in your decision tables (where unhandled cases go), (3) the flow\'s description. Be specific and trust-building, not generic.\n'
            "\n"
            "For all three: ground every claim in tool output. Never invent rules, defaults, or node behaviors.\n"
            "\n"
            "For deeper context on EpicStaff concepts (node types, flow design, "
            "variables namespace, debugging, QA checklist), call list_skills first "
            "to see the catalog, then load_skill(name=<slug>) to read the one that "
            "applies. Skills are several thousand tokens each — load only what you need.\n"
            "\n" + _RICH_FORMAT_GUIDANCE
        )

    def start_conversation(
        self, flow_assistant: FlowAssistant, organization_user
    ) -> FlowAssistantConversation:
        """Create a new conversation, seeding the system prompt as the first message."""
        system_prompt = self.build_system_prompt(flow_assistant)
        # Count prior conversations by a *different* user (not a different
        # org membership of the same user) — the relevant security signal is
        # whether data from a different human user is present.
        other_user_count = (
            FlowAssistantConversation.objects.filter(flow_assistant=flow_assistant)
            .exclude(organization_user__user_id=organization_user.user_id)
            .count()
        )
        if other_user_count > 0:
            logger.info(
                "FlowAssistant {} (graph {}): user {} starting new conversation; {} prior conversation(s) by other users.",
                flow_assistant.pk,
                flow_assistant.graph_id,
                organization_user.user_id,
                other_user_count,
            )
        conversation = FlowAssistantConversation.objects.create(
            flow_assistant=flow_assistant,
            organization_user=organization_user,
            messages=[{"role": "system", "content": system_prompt}],
        )
        logger.info(
            "Started FlowAssistantConversation {} for graph {}",
            conversation.pk,
            flow_assistant.graph_id,
        )
        return conversation

    def apply_title_if_missing(
        self, conversation: FlowAssistantConversation, message: str
    ) -> None:
        """Set conversation.title from the first user message if not yet set.

        Writes to DB only when a title is actually assigned.
        """
        if conversation.title:
            return
        title = _derive_title(message)
        conversation.title = title
        conversation.save(update_fields=["title"])

    async def stream_reply(
        self,
        conversation: FlowAssistantConversation,
        user_message: str,
    ) -> AsyncIterator[StreamEvent]:
        """Stream the LLM reply for the given user message.

        The caller is responsible for having already persisted ``user_message``
        to ``conversation.messages`` before calling this method.  This method
        builds a local working copy of the message history (no mutation of the
        model object), appends assistant / tool messages to that local list as
        the turn progresses, and persists the final state once atomically at the
        end via an UPDATE query — so the model object is never left in an
        inconsistent in-memory state visible to concurrent readers.
        """
        flow_assistant = await sync_to_async(
            lambda: FlowAssistant.objects.select_related(
                "graph", "llm_config__model__llm_provider"
            ).get(pk=conversation.flow_assistant_id)
        )()

        if flow_assistant.llm_config is None:
            raise LLMConfigMissingError(
                f"FlowAssistant for graph {flow_assistant.graph_id} has no llm_config set."
            )

        try:
            client = get_llm_client(
                flow_assistant.llm_config,
                output_schema=FLOW_ASSISTANT_OUTPUT_SCHEMA,
            )
        except UnsupportedLLMProviderError as exc:
            raise LLMConfigInvalidError(str(exc)) from exc

        graph_id = flow_assistant.graph_id

        # Build a local working copy — conversation.messages is NOT touched until
        # the final atomic persist at the very end of this method.
        # The user message is already present in conversation.messages (appended
        # and saved by SendMessageView before the SSE ticket was issued).
        working_messages: list[dict] = list(conversation.messages)

        assistant_content_parts: list[str] = []

        # Accumulates raw JSON tokens emitted by the model when response_format
        # is active.  Only populated during the final (non-tool-calling) turn.
        json_buffer: str = ""
        # Tracks how many characters of the `message` field we have already
        # forwarded as TokenEvents so we can emit only the delta each time.
        last_emitted_message_len: int = 0

        # Tool-calling loop: keep looping until a DoneEvent with no tool calls
        iteration_count = 0
        while True:
            iteration_count += 1
            if iteration_count > _MAX_TOOL_ITERATIONS:
                logger.warning(
                    "Flow Assistant tool-call loop hit max iterations ({}) for conversation {}",
                    _MAX_TOOL_ITERATIONS,
                    conversation.pk,
                )
                yield TokenEvent(
                    content=(
                        "Stopped: too many tool calls in a single turn. The assistant "
                        "seems to be looping — try rephrasing your question."
                    )
                )
                yield DoneEvent()
                return

            current_content: list[str] = []
            current_tool_calls: list[dict] = []
            is_final_turn = True  # assume final until we see tool calls

            payload = _messages_for_llm(working_messages)
            async for event in client.stream_completion(payload, TOOL_SPECS):
                if isinstance(event, DoneEvent):
                    break
                elif isinstance(event, ToolCallEvent):
                    is_final_turn = False
                    current_tool_calls.append(
                        {"id": event.id, "name": event.name, "args": event.args}
                    )
                    yield event
                else:
                    # TokenEvent — the model is emitting content.
                    # When structured output is active the content is raw JSON;
                    # we extract and forward only the `message` field delta so
                    # the frontend's existing token-append logic keeps working.
                    current_content.append(event.content)
                    if is_final_turn:
                        json_buffer += event.content
                        current_message = _partial_json.extract_message_field(
                            json_buffer
                        )
                        if len(current_message) > last_emitted_message_len:
                            delta = current_message[last_emitted_message_len:]
                            last_emitted_message_len = len(current_message)
                            yield event.__class__(content=delta)
                    else:
                        # During tool-calling turns the model emits plain text
                        # (its "thinking" content, if any) — forward as-is.
                        yield event

            text_chunk = "".join(current_content)
            assistant_content_parts.append(text_chunk)

            if not current_tool_calls:
                # No tool calls — we're done with the loop
                break

            # Reset per-turn json state for the next iteration (tool call turns
            # don't produce the final JSON so the buffer is irrelevant there).
            json_buffer = ""
            last_emitted_message_len = 0

            # Record the assistant turn with tool calls in the local working list
            tool_calls_block = [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["name"],
                        "arguments": json.dumps(tc["args"]),
                    },
                }
                for tc in current_tool_calls
            ]
            working_messages.append(
                {
                    "role": "assistant",
                    "content": text_chunk or None,
                    "tool_calls": tool_calls_block,
                }
            )

            # Execute each tool and append results to the local working list
            for tc in current_tool_calls:
                tool_name = tc["name"]
                tool_args = tc["args"]
                tool_callable = _TOOL_CALLABLES.get(tool_name)

                if tool_callable is None:
                    tool_result_content = json.dumps(
                        {"error": f"Unknown tool '{tool_name}'"}
                    )
                else:
                    try:
                        raw_result = await sync_to_async(tool_callable)(
                            graph_id, **tool_args
                        )
                        tool_result_content = json.dumps(
                            raw_result, cls=DjangoJSONEncoder
                        )
                    except Exception as exc:
                        logger.warning(
                            "Tool {} raised {}: {}", tool_name, type(exc).__name__, exc
                        )
                        tool_result_content = json.dumps(
                            {"error": str(exc)}, cls=DjangoJSONEncoder
                        )

                result_event = ToolResultEvent(
                    id=tc["id"],
                    name=tool_name,
                    content=tool_result_content,
                )
                yield result_event

                working_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_result_content,
                    }
                )

        # Parse the full JSON buffer to extract the structured payload.
        # Gracefully degrade: if parsing fails (e.g. the model ignored the
        # response_format schema), fall back to the raw streamed text.
        structured_payload: dict | None = _partial_json.try_parse_full(json_buffer)

        if structured_payload is not None:
            final_text = structured_payload.get("message", "").strip()
            ef_tables: list = structured_payload.get("ef_tables") or []
            action_message: list = structured_payload.get("action_message") or []
            if ef_tables and final_text:
                final_text = _strip_markdown_tables(final_text)
            # Emit the structured event before DoneEvent so the frontend can
            # render rich content (tables, action buttons, prompt chips).
            yield StructuredEvent(
                message=final_text,
                ef_tables=ef_tables,
                action_message=action_message,
            )
        else:
            # Fallback: treat accumulated raw content as plain text.
            if json_buffer:
                logger.warning(
                    "FlowAssistantService: could not parse LLM JSON buffer as "
                    "structured output; falling back to raw text. "
                    "Buffer length: {} chars.",
                    len(json_buffer),
                )
            final_text = "".join(assistant_content_parts).strip()
            ef_tables = []
            action_message = []

        # Append final assistant reply to local working list.
        # Include ef_tables / action_message when present so the persisted
        # history faithfully reflects the structured response.
        if final_text:
            assistant_msg: dict = {"role": "assistant", "content": final_text}
            if ef_tables:
                assistant_msg["ef_tables"] = ef_tables
            if action_message:
                assistant_msg["action_message"] = action_message
            working_messages.append(assistant_msg)

        # Single atomic persist — write the completed history in one UPDATE.
        # Never mutate conversation.messages in place before this point.
        await _persist_messages(conversation.pk, working_messages)

        yield DoneEvent()


@sync_to_async
def _persist_messages(conversation_id: int, messages: list[dict]) -> None:
    """Atomically overwrite the conversation's message history."""
    with transaction.atomic():
        FlowAssistantConversation.objects.filter(pk=conversation_id).update(
            messages=messages,
            last_message_at=timezone.now(),
        )
