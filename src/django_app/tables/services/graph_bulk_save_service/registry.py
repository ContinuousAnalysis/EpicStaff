from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from tables.models.graph_models import (
    AudioTranscriptionNode,
    ConditionalEdge,
    CrewNode,
    DecisionTableNode,
    Edge,
    EndNode,
    FileExtractorNode,
    LLMNode,
    GraphNote,
    PythonNode,
    StartNode,
    SubGraphNode,
    TelegramTriggerNode,
    WebhookTriggerNode,
)
from tables.serializers.graph_bulk_save_serializers import (
    AudioTranscriptionNodeBulkSerializer,
    CrewNodeBulkSerializer,
    DecisionTableNodeBulkSerializer,
    EndNodeBulkSerializer,
    FileExtractorNodeBulkSerializer,
    LLMNodeBulkSerializer,
    GraphNoteBulkSerializer,
    PythonNodeBulkSerializer,
    StartNodeBulkSerializer,
    SubGraphNodeBulkSerializer,
    TelegramTriggerNodeBulkSerializer,
    WebhookTriggerNodeBulkSerializer,
)
from tables.services.graph_bulk_save_service.saveables import (
    _DecisionTableNodeRefsSaveable,
    DecisionTableNodeSaveable,
    _SerializerSaveable,
)


class NodeSaveableFactory(ABC):
    """NodeSaveableFactory — strategy for building a saveable for one node type"""

    def preprocess_data(self, data: dict, payload_temp_ids: set) -> tuple[dict, dict]:
        """
        Override preprocess_data when a node type has fields that must be
        extracted before the serializer runs (e.g. nested relations, wire-only
        routing temp_ids).
        Returns (data_for_serializer, extra_data_for_build).
        The default passes data through unchanged.

        payload_temp_ids: the full set of temp_id strings declared across all
        node lists in this request — used to validate *_node_temp_id references.
        """
        return data, {}

    # Build the inner saveable from the validated serializer and extra data
    # extracted in preprocess_data.
    @abstractmethod
    def build(self, serializer, extra: dict, instance=None): ...

    def build_deferred(self, inner_saveable, extra: dict):
        """
        Return a deferred ref saveable (implements resolve_and_save(temp_id_map)),
        or None if this node type has no deferred routing refs.
        Called after build(); override only for node types with temp routing refs.
        """
        return None


class DefaultNodeSaveableFactory(NodeSaveableFactory):
    def preprocess_data(self, data: dict, payload_temp_ids: set) -> tuple[dict, dict]:
        return data, {}

    def build(self, serializer, extra: dict, instance=None):
        """Standard node types: just wrap the serializer"""
        return _SerializerSaveable(serializer)


class DecisionTableNodeSaveableFactory(NodeSaveableFactory):
    """
    Factory for DecisionTableNode.

    preprocess_data() pops condition_groups and the three routing *_node_temp_id
    companion fields before the serializer runs, validates mutual exclusion and
    temp_id existence, and stores the parsed refs in extra.

    build_deferred() returns a _DecisionTableNodeRefsSaveable when any routing
    field carries a deferred (temp) reference, wiring it into the inner saveable
    so it is called back after the node and its condition groups are saved.

    Adding a new node type with routing temp_id refs:
    1. Create XxxNodeSaveableFactory(NodeSaveableFactory) following this pattern.
    2. Add one NodeTypeConfig line to NODE_TYPE_REGISTRY.
    """

    # Routing field pairs at the DecisionTableNode level.
    _NODE_ROUTING_PAIRS = (
        ("default_next_node_id", "default_next_node_temp_id"),
        ("next_error_node_id", "next_error_node_temp_id"),
    )
    # Routing field pair at the ConditionGroup level.
    _GROUP_ROUTING_PAIR = ("next_node_id", "next_node_temp_id")

    def preprocess_data(self, data: dict, payload_temp_ids: set) -> tuple[dict, dict]:
        # --- condition_groups (existing logic) ---
        condition_groups_data = data.pop("condition_groups", None)

        routing_errors: list[str] = []

        # --- node-level routing refs ---
        node_routing_refs: dict = {}  # id_field -> (is_temp, value) | None

        for id_field, temp_field in self._NODE_ROUTING_PAIRS:
            error, ref = self._parse_optional_routing_ref(
                data, id_field, temp_field, payload_temp_ids
            )
            if error:
                routing_errors.append(error)
            else:
                node_routing_refs[id_field] = ref
                if (
                    ref is not None and ref[0]
                ):  # is_temp → write null until deferred resolve
                    data[id_field] = None
                elif ref is None:
                    # Neither provided — ensure field is explicitly null.
                    data.setdefault(id_field, None)

        # --- per-condition-group routing refs ---
        group_routing_refs: list = []  # positional; one entry per condition group

        if condition_groups_data:
            id_field, temp_field = self._GROUP_ROUTING_PAIR
            for group_idx, group_data in enumerate(condition_groups_data):
                error, ref = self._parse_optional_routing_ref(
                    group_data,
                    id_field,
                    temp_field,
                    payload_temp_ids,
                    context=f"condition_groups[{group_idx}]",
                )
                if error:
                    routing_errors.append(error)
                    group_routing_refs.append(None)
                else:
                    group_routing_refs.append(ref)
                    if ref is not None and ref[0]:  # is_temp
                        group_data[id_field] = None
                    elif ref is None:
                        group_data.setdefault(id_field, None)

        extra = {
            "condition_groups": condition_groups_data,
            "node_routing_refs": node_routing_refs,
            "group_routing_refs": group_routing_refs,
            "routing_errors": routing_errors,
        }
        return data, extra

    def build(self, serializer, extra: dict, instance=None):
        return DecisionTableNodeSaveable(
            serializer,
            extra.get("condition_groups"),
            instance=instance,
            # deferred_refs_saveable injected by build_deferred, not here
        )

    def build_deferred(self, inner_saveable, extra: dict):
        """
        Build a _DecisionTableNodeRefsSaveable if any routing field carries a ref,
        and wire it into the inner saveable so save() calls set_node_id /
        set_group_ids on it.  Returns the deferred saveable or None.
        """
        node_routing_refs: dict = extra.get("node_routing_refs", {})
        group_routing_refs: list = extra.get("group_routing_refs", [])

        default_next_ref = node_routing_refs.get("default_next_node_id")
        next_error_ref = node_routing_refs.get("next_error_node_id")

        has_any_ref = (
            default_next_ref is not None
            or next_error_ref is not None
            or any(r is not None for r in group_routing_refs)
        )
        if not has_any_ref:
            return None

        deferred = _DecisionTableNodeRefsSaveable(
            default_next_ref=default_next_ref,
            next_error_ref=next_error_ref,
            group_refs=group_routing_refs,
        )
        inner_saveable._deferred = deferred
        return deferred

    @staticmethod
    def _parse_optional_routing_ref(
        data: dict,
        id_field: str,
        temp_field: str,
        payload_temp_ids: set,
        context: str = "",
    ) -> tuple:
        """
        Parse one optional routing ref pair from data (mutates: pops temp_field).

        Returns (error_string | None, ref_tuple | None).
        ref_tuple is (is_temp: bool, value) or None (neither field provided).

        Rules (nullable field — "at most one"):
          - Both provided → error
          - Only temp_id  → (True, temp_str), must exist in payload_temp_ids
          - Only real id  → (False, node_id)
          - Neither       → None  (field stays null)
        """
        node_id = data.get(id_field)
        temp_id = data.pop(temp_field, None)  # always strip wire-only field

        has_id = node_id is not None
        has_temp = temp_id is not None

        prefix = f"{context}: " if context else ""

        if has_id and has_temp:
            return (
                f"{prefix}Provide at most one of {id_field} or {temp_field}, not both.",
                None,
            )

        if has_temp:
            temp_str = str(temp_id)
            if temp_str not in payload_temp_ids:
                return (
                    f"{prefix}{temp_field}={temp_str!r} does not match any temp_id "
                    f"in the node lists of this request.",
                    None,
                )
            return None, (True, temp_str)

        if has_id:
            return None, (False, node_id)

        # Neither provided — field should be null.
        return None, None


# Adding a future node type with nested write logic:
# 1. Create a new XxxNodeSaveableFactory(NodeSaveableFactory) here.
# 2. Add one NodeTypeConfig line to NODE_TYPE_REGISTRY below.
# No changes to service.py.

# Singletons — factories are stateless.
_DEFAULT_FACTORY = DefaultNodeSaveableFactory()
_DECISION_TABLE_FACTORY = DecisionTableNodeSaveableFactory()


@dataclass
class NodeTypeConfig:
    """NodeTypeConfig contains all required data about one node type"""

    list_key: str  # key in the request payload, e.g. "crew_node_list"
    delete_key: str  # key in the deleted dict, e.g. "crew_node_ids"
    model_class: type  # Django model class, e.g. CrewNode
    serializer_class: type  # bulk serializer class, e.g. CrewNodeBulkSerializer
    saveable_factory: NodeSaveableFactory = field(default=None)

    def __post_init__(self):
        if self.saveable_factory is None:
            self.saveable_factory = _DEFAULT_FACTORY


@dataclass
class EdgeDeleteConfig:
    """EdgeDeleteConfig contains required data for edge"""

    delete_key: str  # key in the deleted dict, e.g. "edge_ids"
    model_class: type  # Django model class, e.g. Edge


"""
NODE_TYPE_REGISTRY — single source of truth for all node types

To add a new node type:
  1. Add one BulkSerializer class in graph_bulk_save_serializers.py.
  2. Add one NodeTypeConfig line here.
  Everything else (service loop, serializer fields, deletions, temp_id
  scan) updates automatically.
"""

NODE_TYPE_REGISTRY: list[NodeTypeConfig] = [
    NodeTypeConfig(
        "crew_node_list",
        "crew_node_ids",
        CrewNode,
        CrewNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "python_node_list",
        "python_node_ids",
        PythonNode,
        PythonNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "file_extractor_node_list",
        "file_extractor_node_ids",
        FileExtractorNode,
        FileExtractorNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "audio_transcription_node_list",
        "audio_transcription_node_ids",
        AudioTranscriptionNode,
        AudioTranscriptionNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "llm_node_list",
        "llm_node_ids",
        LLMNode,
        LLMNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "start_node_list",
        "start_node_ids",
        StartNode,
        StartNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "end_node_list",
        "end_node_ids",
        EndNode,
        EndNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "subgraph_node_list",
        "subgraph_node_ids",
        SubGraphNode,
        SubGraphNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "decision_table_node_list",
        "decision_table_node_ids",
        DecisionTableNode,
        DecisionTableNodeBulkSerializer,
        saveable_factory=_DECISION_TABLE_FACTORY,
    ),
    NodeTypeConfig(
        "graph_note_list",
        "graph_note_ids",
        GraphNote,
        GraphNoteBulkSerializer,
    ),
    NodeTypeConfig(
        "webhook_trigger_node_list",
        "webhook_trigger_node_ids",
        WebhookTriggerNode,
        WebhookTriggerNodeBulkSerializer,
    ),
    NodeTypeConfig(
        "telegram_trigger_node_list",
        "telegram_trigger_node_ids",
        TelegramTriggerNode,
        TelegramTriggerNodeBulkSerializer,
    ),
]


"""
EDGE_DELETE_CONFIGS — edges must be deleted before nodes (FK constraints).
Kept separate from NODE_TYPE_REGISTRY because edges are not upserted via
this registry; they have their own validation path in the service.
"""

EDGE_DELETE_CONFIGS: list[EdgeDeleteConfig] = [
    EdgeDeleteConfig("edge_ids", Edge),
    EdgeDeleteConfig("conditional_edge_ids", ConditionalEdge),
]
