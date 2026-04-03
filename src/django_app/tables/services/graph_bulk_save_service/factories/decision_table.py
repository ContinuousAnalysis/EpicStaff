from tables.services.graph_bulk_save_service.factories.base import NodeSaveableFactory
from tables.services.graph_bulk_save_service.saveables import (
    _DecisionTableNodeRefsSaveable,
    DecisionTableNodeSaveable,
)


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
        # condition_groups (existing logic)
        condition_groups_data = data.pop("condition_groups", None)

        routing_errors: list[str] = []

        # node-level routing refs
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

        # per-condition-group routing refs
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
