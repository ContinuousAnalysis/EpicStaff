from __future__ import annotations

"""
Stateless read-only tools for the Flow Assistant.

Every function takes a graph_id plus tool-specific args and returns a plain
dict or list.  They are synchronous (called via sync_to_async from the async
service layer).  All ORM access uses select_related / prefetch_related to
avoid N+1 queries.

Secret redaction: any config key whose name contains 'api_key', 'secret', or
'token' (case-insensitive) is replaced with "***".
"""

import re

from django.db.models import Prefetch

from tables.models.graph_models import (
    AudioTranscriptionNode,
    ClassificationDecisionTableNode,
    ClassificationConditionGroup,
    CodeAgentNode,
    ConditionGroup,
    CrewNode,
    DecisionTableNode,
    Edge,
    EndNode,
    FileExtractorNode,
    LLMNode,
    PythonNode,
    StartNode,
    SubGraphNode,
    TelegramTriggerNode,
    WebhookTriggerNode,
)

_SECRET_PATTERN = re.compile(r"api_key|secret|token", re.IGNORECASE)

# ── node tables in evaluation order ──────────────────────────────────────────

# Each entry: (type_label, model_class, has_db_node_name).
# has_db_node_name=False means node_name is a @property returning a fixed
# string (StartNode → "__start__", EndNode → "__end_node__"); we must NOT
# pass "node_name" to .only() for those models or Django will raise
# FieldDoesNotExist.
_NODE_TABLES: list[tuple[str, type, bool]] = [
    ("crew", CrewNode, True),
    ("python", PythonNode, True),
    ("llm", LLMNode, True),
    ("file_extractor", FileExtractorNode, True),
    ("audio_transcription", AudioTranscriptionNode, True),
    ("subgraph", SubGraphNode, True),
    ("code_agent", CodeAgentNode, True),
    ("start", StartNode, False),
    ("end", EndNode, False),
    ("decision_table", DecisionTableNode, True),
    ("classification_decision_table", ClassificationDecisionTableNode, True),
    ("webhook_trigger", WebhookTriggerNode, True),
    ("telegram_trigger", TelegramTriggerNode, True),
]


def _redact(value: object, key: str = "") -> object:
    """Recursively redact secret fields in a plain-Python structure."""
    if isinstance(value, dict):
        return {k: _redact(v, k) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if key and _SECRET_PATTERN.search(key):
        return "***"
    return value


def _node_to_dict(node_type: str, node) -> dict:
    """Convert a node ORM object to a sanitised dict."""
    result: dict = {"type": node_type, "id": node.pk}
    if hasattr(node, "node_name"):
        result["name"] = node.node_name

    # Collect config-like fields, skipping FK ids and internal fields
    skip = {
        "id",
        "graph_id",
        "graph",
        "crew_id",
        "crew",
        "python_code_id",
        "python_code",
        "llm_config_id",
        "llm_config",
        "subgraph_id",
        "subgraph",
        "webhook_trigger_id",
        "webhook_trigger",
        "metadata",
        "content_hash",
    }
    config: dict = {}
    for field in node._meta.fields:
        fname = field.name
        if fname in skip:
            continue
        raw_value = getattr(node, fname)
        config[fname] = _redact(raw_value, fname)
    result["config"] = config
    return result


# ── Decision-table rule serializers ──────────────────────────────────────────


def _serialize_decision_table_rules(node: DecisionTableNode) -> list[dict]:
    """Return a human-readable list of rules for a DecisionTableNode.

    Each entry represents one ConditionGroup (a named rule/branch) with its
    constituent conditions and the target node id it routes to.

    Shape:
      [
        {
          "rule_name": "high_value_order",
          "rule_type": "simple",          # "simple" or "complex"
          "expression": "...",            # complex-type join expression, else null
          "conditions": [
            {"name": "amount_check", "expression": "amount > 10000"},
            ...
          ],
          "routes_to_node_id": 42,        # null when not yet wired
        },
        ...
      ]
    """
    groups = (
        ConditionGroup.objects.filter(decision_table_node=node)
        .prefetch_related("conditions")
        .order_by("order")
    )
    rules: list[dict] = []
    for group in groups:
        conditions = [
            {"name": c.condition_name, "expression": c.condition}
            for c in group.conditions.all().order_by("order")
        ]
        rules.append(
            {
                "rule_name": group.group_name,
                "rule_type": group.group_type,
                "expression": group.expression,
                "manipulation": group.manipulation,
                "conditions": conditions,
                "routes_to_node_id": group.next_node_id,
            }
        )
    return rules


def _serialize_classification_decision_table_rules(
    node: ClassificationDecisionTableNode,
) -> list[dict]:
    """Return a human-readable list of rules for a ClassificationDecisionTableNode.

    Each entry represents one ClassificationConditionGroup (a named branch) with its
    expression/manipulation and the target node id it routes to.

    Shape:
      [
        {
          "rule_name": "positive_sentiment",
          "route_code": "pos",            # short routing key, may be null
          "expression": "...",
          "manipulation": "...",
          "field_expressions": {...},
          "continue_to_next_rule": false,
          "routes_to_node_id": 55,
          "prompt_id": "sentiment_check", # which prompt drives classification, may be null
        },
        ...
      ]
    """
    groups = (
        ClassificationConditionGroup.objects.filter(
            classification_decision_table_node=node
        ).order_by("order")
    )
    rules: list[dict] = []
    for group in groups:
        rules.append(
            {
                "rule_name": group.group_name,
                "route_code": group.route_code,
                "expression": group.expression,
                "manipulation": group.manipulation,
                "field_expressions": group.field_expressions or {},
                "continue_to_next_rule": group.continue_flag,
                "routes_to_node_id": group.next_node_id,
                "prompt_id": group.prompt_id,
            }
        )
    return rules


# ── public tool functions ─────────────────────────────────────────────────────


def get_flow_overview(graph_id: int) -> dict:
    """Return a high-level summary of the flow."""
    from tables.models.graph_models import Graph

    graph = Graph.objects.prefetch_related(
        "crew_node_list",
        "python_node_list",
        "llm_node_list",
        "file_extractor_node_list",
        "audio_transcription_node_list",
        "code_agent_node_list",
        "start_node_list",
        "end_node",
        "decision_table_node_list",
        "classification_decision_table_node_list",
        "webhook_trigger_node_list",
        "telegram_trigger_node_list",
        "edge_list",
        Prefetch(
            "subgraph_node_list",
            queryset=SubGraphNode.objects.select_related("subgraph"),
        ),
    ).get(pk=graph_id)

    node_count_by_type = {
        "crew": graph.crew_node_list.count(),
        "python": graph.python_node_list.count(),
        "llm": graph.llm_node_list.count(),
        "file_extractor": graph.file_extractor_node_list.count(),
        "audio_transcription": graph.audio_transcription_node_list.count(),
        "subgraph": graph.subgraph_node_list.count(),
        "code_agent": graph.code_agent_node_list.count(),
        "start": graph.start_node_list.count(),
        "end": graph.end_node.count(),
        "decision_table": graph.decision_table_node_list.count(),
        "classification_decision_table": graph.classification_decision_table_node_list.count(),
        "webhook_trigger": graph.webhook_trigger_node_list.count(),
        "telegram_trigger": graph.telegram_trigger_node_list.count(),
    }

    # Build flat node list sorted by (type, id).
    # For has_db_node_name=True tables the prefetch already loaded the rows;
    # we do a small per-table .only() pass here to keep things simple and
    # avoid pulling unneeded columns out of the prefetch cache.
    raw_nodes: list[tuple[str, int, str]] = []
    for node_type, model_cls, has_db_node_name in _NODE_TABLES:
        fields = ["id", "node_name"] if has_db_node_name else ["id"]
        for node in model_cls.objects.filter(graph_id=graph_id).only(*fields):
            raw_nodes.append((node_type, node.pk, getattr(node, "node_name", "")))
    raw_nodes.sort(key=lambda t: (t[0], t[1]))
    nodes: list[dict] = [
        {"id": node_id, "type": node_type, "name": name}
        for node_type, node_id, name in raw_nodes
    ]

    subflows = [
        {
            "id": sn.subgraph.pk,
            "name": sn.subgraph.name,
            "description": sn.subgraph.description,
        }
        for sn in graph.subgraph_node_list.all()
        if sn.subgraph
    ]

    return {
        "id": graph.pk,
        "name": graph.name,
        "description": graph.description,
        "node_count_by_type": node_count_by_type,
        "nodes": nodes,
        "edge_count": graph.edge_list.count(),
        "subflows": subflows,
    }


def get_node(graph_id: int, node_id: str) -> dict:
    """Resolve a node by PK across all node tables and return its config.

    node_id is expected to be an integer string (e.g. "42").  Secrets are
    redacted from config output.

    Uses the node index to find the correct table first (1 query), then
    fetches the full object from that table (1 query) — 2 queries total
    instead of up to 13 try/except probes.
    """
    try:
        pk = int(node_id)
    except (ValueError, TypeError):
        return {"error": f"Invalid node_id '{node_id}': must be an integer string."}

    # One query per table maximum, covering the whole graph.  For a single
    # node lookup this still pays the full index-build cost, but it replaces
    # up to 13 sequential try/get probes with a fixed 13-query batch.
    node_index = _build_node_index(graph_id)
    identity = node_index.get(pk)
    if identity is None:
        return {"error": f"Node with id={node_id} not found in graph {graph_id}."}

    node_type = identity["type"]
    model_cls = next(model for label, model, _ in _NODE_TABLES if label == node_type)
    node = model_cls.objects.get(pk=pk, graph_id=graph_id)
    result = _node_to_dict(node_type, node)

    # Attach decision rules for the two decision-table node types so the LLM
    # can reason about branching logic without requiring separate tool calls.
    if node_type == "decision_table":
        result["decision_rules"] = _serialize_decision_table_rules(node)
    elif node_type == "classification_decision_table":
        result["decision_rules"] = _serialize_classification_decision_table_rules(node)

    # Add connected edge IDs
    outgoing = list(
        Edge.objects.filter(graph_id=graph_id, start_node_id=pk).values_list(
            "end_node_id", flat=True
        )
    )
    incoming = list(
        Edge.objects.filter(graph_id=graph_id, end_node_id=pk).values_list(
            "start_node_id", flat=True
        )
    )
    result["connected_node_ids"] = {"outgoing": outgoing, "incoming": incoming}
    return result


def get_subflow(graph_id: int, subgraph_node_id: str) -> dict:
    """Return the target subgraph's name and description only.

    subgraph_node_id is the PK of the SubGraphNode row (not the subgraph itself).
    """
    try:
        pk = int(subgraph_node_id)
    except (ValueError, TypeError):
        return {"error": f"Invalid subgraph_node_id '{subgraph_node_id}'."}

    try:
        sn = SubGraphNode.objects.select_related("subgraph").get(
            pk=pk, graph_id=graph_id
        )
    except SubGraphNode.DoesNotExist:
        return {
            "error": f"SubGraphNode {subgraph_node_id} not found in graph {graph_id}."
        }

    if not sn.subgraph:
        return {"error": "SubGraphNode has no linked subgraph."}

    return {
        "id": sn.subgraph.pk,
        "name": sn.subgraph.name,
        "description": sn.subgraph.description,
    }


def get_edges_from(graph_id: int, node_id: str) -> list[dict]:
    """Return outgoing edges from a node."""
    try:
        pk = int(node_id)
    except (ValueError, TypeError):
        return [{"error": f"Invalid node_id '{node_id}'."}]

    edges = list(Edge.objects.filter(graph_id=graph_id, start_node_id=pk))
    if not edges:
        return []

    # Build the index once for the whole graph — O(13) queries regardless of
    # how many edges are returned.  Each _resolve_node_identity call is then
    # an O(1) dict lookup.
    node_index = _build_node_index(graph_id)
    result = []
    for edge in edges:
        target_info = _resolve_node_identity(edge.end_node_id, node_index)
        result.append(
            {
                "edge_id": edge.pk,
                "target_node_id": edge.end_node_id,
                "target_node_name": target_info.get("name", ""),
                "target_node_type": target_info.get("type", ""),
            }
        )
    return result


def get_edges_to(graph_id: int, node_id: str) -> list[dict]:
    """Return incoming edges to a node."""
    try:
        pk = int(node_id)
    except (ValueError, TypeError):
        return [{"error": f"Invalid node_id '{node_id}'."}]

    edges = list(Edge.objects.filter(graph_id=graph_id, end_node_id=pk))
    if not edges:
        return []

    # Build the index once for the whole graph — O(13) queries regardless of
    # how many edges are returned.  Each _resolve_node_identity call is then
    # an O(1) dict lookup.
    node_index = _build_node_index(graph_id)
    result = []
    for edge in edges:
        source_info = _resolve_node_identity(edge.start_node_id, node_index)
        result.append(
            {
                "edge_id": edge.pk,
                "source_node_id": edge.start_node_id,
                "source_node_name": source_info.get("name", ""),
                "source_node_type": source_info.get("type", ""),
            }
        )
    return result


def list_node_types(graph_id: int) -> list[str]:
    """Return the distinct node types present in the flow."""
    from tables.models.graph_models import Graph

    graph = Graph.objects.prefetch_related(
        "crew_node_list",
        "python_node_list",
        "llm_node_list",
        "file_extractor_node_list",
        "audio_transcription_node_list",
        "subgraph_node_list",
        "code_agent_node_list",
        "start_node_list",
        "end_node",
        "decision_table_node_list",
        "classification_decision_table_node_list",
        "webhook_trigger_node_list",
        "telegram_trigger_node_list",
    ).get(pk=graph_id)

    present = []
    checks = [
        ("crew", graph.crew_node_list),
        ("python", graph.python_node_list),
        ("llm", graph.llm_node_list),
        ("file_extractor", graph.file_extractor_node_list),
        ("audio_transcription", graph.audio_transcription_node_list),
        ("subgraph", graph.subgraph_node_list),
        ("code_agent", graph.code_agent_node_list),
        ("start", graph.start_node_list),
        ("end", graph.end_node),
        ("decision_table", graph.decision_table_node_list),
        (
            "classification_decision_table",
            graph.classification_decision_table_node_list,
        ),
        ("webhook_trigger", graph.webhook_trigger_node_list),
        ("telegram_trigger", graph.telegram_trigger_node_list),
    ]
    for label, qs in checks:
        if qs.exists():
            present.append(label)
    return present


def list_skills() -> dict:
    """Return the catalog of EpicStaff knowledge skills."""
    from .skills_loader import list_skills_summaries

    return {"skills": list_skills_summaries()}


def load_skill(name: str) -> dict:
    """Return the full content of one EpicStaff knowledge skill."""
    from .skills_loader import load_skill_body

    body = load_skill_body(name)
    if body is None:
        return {
            "error": f"Unknown skill '{name}'. Call list_skills to see available skills."
        }
    return {"name": name, "content": body}


# ── internal helpers ──────────────────────────────────────────────────────────


def _build_node_index(graph_id: int) -> dict[int, dict]:
    """Build a {node_pk: {type, name}} mapping for every node in the graph.

    Issues exactly one query per node table (up to 13), fetching only the
    columns needed.  This replaces the previous per-edge try/except loop
    across all 13 tables, which produced O(edges × tables) queries.

    For models where node_name is a @property (StartNode, EndNode) we fetch
    only "id" and call the property after instantiation; Django reconstructs
    a minimal instance without touching the DB again.
    """
    index: dict[int, dict] = {}
    for node_type, model_cls, has_db_node_name in _NODE_TABLES:
        fields = ["id", "node_name"] if has_db_node_name else ["id"]
        for node in model_cls.objects.filter(graph_id=graph_id).only(*fields):
            index[node.pk] = {
                "type": node_type,
                "name": getattr(node, "node_name", ""),
            }
    return index


def _resolve_node_identity(node_pk: int, node_index: dict[int, dict]) -> dict:
    """Look up {type, name} for a node PK using a pre-built index.

    O(1) — no database queries.  node_index must have been produced by
    _build_node_index() for the same graph_id.
    """
    return node_index.get(node_pk, {"type": "unknown", "name": ""})


# ── Public display-name helpers ───────────────────────────────────────────────


def resolve_node_display_name(
    graph_id: int,
    node_id: int,
    node_index: dict[int, dict] | None = None,
) -> str | None:
    """Best-effort lookup of a node's display name.  Returns None on miss.

    Pass node_index when resolving multiple nodes in a single graph context to
    avoid rebuilding the index each call.  If node_index is None, one is built
    internally (up to 13 ORM queries).
    """
    try:
        index = node_index if node_index is not None else _build_node_index(graph_id)
        entry = index.get(int(node_id))
        if entry is None:
            return None
        name = entry.get("name") or None
        return name
    except (ValueError, TypeError):
        return None


def resolve_subgraph_display_name(graph_id: int, subgraph_node_id: int) -> str | None:
    """Best-effort lookup of the target subgraph's name.  Returns None on miss.

    subgraph_node_id is the PK of the SubGraphNode row (not the subgraph itself).
    """
    try:
        sn = SubGraphNode.objects.select_related("subgraph").get(
            pk=int(subgraph_node_id),
            graph_id=graph_id,
        )
        return sn.subgraph.name if sn.subgraph else None
    except (SubGraphNode.DoesNotExist, ValueError, TypeError):
        return None
