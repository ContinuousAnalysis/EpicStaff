from typing import Any

from django.apps import apps
from django.db import connection, transaction

from tables.models.base_models import BaseGlobalNode
from tables.models import Graph
from tables.models.graph_models import ConditionalEdge, Edge

from tables.serializers.graph_bulk_save_serializers import (
    ConditionalEdgeBulkSerializer,
    EdgeBulkSerializer,
)
from tables.exceptions import BulkSaveValidationError
from tables.services.graph_bulk_save_service.registry import (
    EDGE_DELETE_CONFIGS,
    NODE_TYPE_REGISTRY,
    NodeTypeConfig,
)
from tables.services.graph_bulk_save_service.saveables import (
    _ConditionalEdgeSaveable,
    _EdgeSaveable,
    _NodeSaveable,
)


class GraphBulkSaveService:
    """
    Two-pass bulk save:
        Pass 1  validate everything and collect saveables (no DB writes).
        Pass 2  execute deletions then saves atomically; nodes before edges
              so the temp_id -> real_id map is ready when edges are written.

    Raises BulkSaveValidationError with a structured error dict if any entity
    fails validation. No DB writes happen in that case.
    """

    def save(self, graph: Graph, validated_input: dict) -> Graph:
        deleted_data = validated_input.get("deleted", {})
        all_errors: dict = {}
        node_saveables: list[_NodeSaveable] = []
        edge_saveables: list = []

        payload_temp_ids: set[str] = self._collect_payload_temp_ids(validated_input)

        # Pass 1: validate deletions
        deletion_errors = self._validate_deletions(graph, deleted_data)
        if deletion_errors:
            all_errors["deleted"] = deletion_errors

        # Pass 1: validate nodes (driven by registry — no hardcoded lists)
        routing_refs_to_validate: set[int] = set()
        for config in NODE_TYPE_REGISTRY:
            incoming = validated_input.get(config.list_key, [])
            if not incoming:
                continue
            db_map = {
                obj.id: obj for obj in config.model_class.objects.filter(graph=graph)
            }
            errors, entity_saveables, deferred_savs, routing_refs = (
                self._validate_node_list(
                    graph, incoming, config, db_map, payload_temp_ids
                )
            )
            if errors:
                all_errors[config.list_key] = errors
            else:
                node_saveables.extend(entity_saveables)
                edge_saveables.extend(deferred_savs)
                routing_refs_to_validate |= routing_refs

        # Pass 1: validate edges
        existing_node_ref_errors = []
        edge_refs_to_validate: set[int] = set()

        edge_errors, edge_savs, refs = self._validate_edge_list(
            graph,
            validated_input.get("edge_list", []),
            EdgeBulkSerializer,
            Edge,
            payload_temp_ids,
        )
        if edge_errors:
            all_errors["edge_list"] = edge_errors
        else:
            edge_saveables.extend(edge_savs)
            edge_refs_to_validate |= refs

        cond_errors, cond_savs, cond_refs = self._validate_conditional_edge_list(
            graph,
            validated_input.get("conditional_edge_list", []),
            payload_temp_ids,
        )
        if cond_errors:
            all_errors["conditional_edge_list"] = cond_errors
        else:
            edge_saveables.extend(cond_savs)
            edge_refs_to_validate |= cond_refs

        # Batch-validate all real (non-temp) node refs across edge types and
        # decision table routing fields combined.
        all_real_refs = edge_refs_to_validate | routing_refs_to_validate
        if all_real_refs:
            invalid_ids = self._find_nonexistent_global_node_ids(all_real_refs)
            if invalid_ids:
                # Partition errors by source for clearer attribution.
                invalid_edge_refs = invalid_ids & edge_refs_to_validate
                invalid_routing_refs = invalid_ids & routing_refs_to_validate
                if invalid_edge_refs:
                    existing_node_ref_errors.append(
                        f"Edge references node IDs that do not exist: {sorted(invalid_edge_refs)}"
                    )
                if invalid_routing_refs:
                    existing_node_ref_errors.append(
                        f"DecisionTableNode routing references node IDs that do not exist: "
                        f"{sorted(invalid_routing_refs)}"
                    )
        if existing_node_ref_errors:
            all_errors.setdefault("edge_list", []).extend(existing_node_ref_errors)

        if all_errors:
            raise BulkSaveValidationError(all_errors)

        # Pass 2: atomic write
        self._execute_writes(graph, deleted_data, node_saveables, edge_saveables)
        return graph

    def _validate_node_list(
        self,
        graph: Graph,
        incoming_list: list[dict],
        config: NodeTypeConfig,
        db_map: dict,
        payload_temp_ids: set[str],
    ) -> tuple[list, list[_NodeSaveable], list, set[int]]:
        """Validate all items in one node list.
        Returns (errors, node_saveables, deferred_saveables, real_routing_node_ids)."""
        errors = []
        saveables = []
        deferred_saveables = []
        real_routing_refs: set[int] = set()

        for index, item_data in enumerate(incoming_list):
            item_data = dict(item_data)
            item_id = item_data.get("id")
            temp_id = str(item_data.pop("temp_id", None) or "")  # wire-only, strip now

            if item_id is None:
                item_data.pop("id", None)
                error, inner, deferred = self._build_saveable(
                    config, item_data, index, payload_temp_ids
                )
            else:
                db_instance = db_map.get(item_id)
                if db_instance is None:
                    errors.append(
                        {
                            "index": index,
                            "errors": f"id={item_id} not found in graph {graph.id}",
                        }
                    )
                    continue

                item_data.pop("id", None)
                error, inner, deferred = self._build_saveable(
                    config, item_data, index, payload_temp_ids, instance=db_instance
                )

            if error:
                errors.append(error)
            else:
                saveables.append(_NodeSaveable(inner, temp_id or None))
                if deferred is not None:
                    deferred_saveables.append(deferred)
                    real_routing_refs |= self._collect_real_routing_refs(deferred)

        return errors, saveables, deferred_saveables, real_routing_refs

    def _build_saveable(
        self,
        config: NodeTypeConfig,
        data: dict,
        index: int,
        payload_temp_ids: set[str],
        instance=None,
    ) -> tuple[dict | None, Any, Any]:
        """Build one saveable via the config factory.
        Returns (error, inner_saveable, deferred_saveable) or (error, None, None)."""
        data, extra = config.saveable_factory.preprocess_data(data, payload_temp_ids)

        # Surface routing validation errors collected by preprocess_data before
        # attempting serializer construction.
        routing_errors = extra.get("routing_errors", [])
        if routing_errors:
            return {"index": index, "errors": routing_errors}, None, None

        s = (
            config.serializer_class(instance, data=data)
            if instance is not None
            else config.serializer_class(data=data)
        )
        if not s.is_valid():
            return {"index": index, "errors": s.errors}, None, None

        inner = config.saveable_factory.build(s, extra, instance)
        deferred = config.saveable_factory.build_deferred(inner, extra)
        return None, inner, deferred

    @staticmethod
    def _collect_real_routing_refs(deferred) -> set[int]:
        """Extract real (non-temp) node IDs from a _DecisionTableNodeRefsSaveable
        for batch existence validation in Pass 1."""
        refs: set[int] = set()
        for attr in ("_default_next_ref", "_next_error_ref"):
            ref = getattr(deferred, attr, None)
            if ref is not None and not ref[0]:  # not is_temp
                refs.add(ref[1])
        for ref in getattr(deferred, "_group_refs", []):
            if ref is not None and not ref[0]:
                refs.add(ref[1])
        return refs

    def _validate_edge_list(
        self,
        graph: Graph,
        incoming_list: list[dict],
        serializer_class,
        model_class,
        payload_temp_ids: set[str],
    ) -> tuple[list, list[_EdgeSaveable], set[int]]:
        """Validate all Edge items. Returns (errors, saveables, real_node_ids_to_check)."""
        errors = []
        saveables = []
        existing_refs: set[int] = set()

        db_map = {obj.id: obj for obj in model_class.objects.filter(graph=graph)}

        for index, item_data in enumerate(incoming_list):
            item_data = dict(item_data)
            item_id = item_data.get("id")

            start_ref_error, start_ref = self._parse_node_ref(
                item_data, "start_node_id", "start_temp_id", payload_temp_ids, index
            )
            end_ref_error, end_ref = self._parse_node_ref(
                item_data, "end_node_id", "end_temp_id", payload_temp_ids, index
            )

            ref_errors = [e for e in (start_ref_error, end_ref_error) if e]
            if ref_errors:
                errors.extend(ref_errors)
                continue

            if start_ref and not start_ref[0]:
                existing_refs.add(start_ref[1])
            if end_ref and not end_ref[0]:
                existing_refs.add(end_ref[1])

            if item_id is None:
                item_data.pop("id", None)
                s = serializer_class(data=item_data)
                if not s.is_valid():
                    errors.append({"index": index, "errors": s.errors})
                    continue
                saveables.append(_EdgeSaveable(s, start_ref, end_ref, instance=None))
            else:
                db_instance = db_map.get(item_id)
                if db_instance is None:
                    errors.append(
                        {
                            "index": index,
                            "errors": f"id={item_id} not found in graph {graph.id}",
                        }
                    )
                    continue

                item_data.pop("id", None)
                s = serializer_class(db_instance, data=item_data)
                if not s.is_valid():
                    errors.append({"index": index, "errors": s.errors})
                    continue
                saveables.append(
                    _EdgeSaveable(s, start_ref, end_ref, instance=db_instance)
                )

        return errors, saveables, existing_refs

    def _validate_conditional_edge_list(
        self,
        graph: Graph,
        incoming_list: list[dict],
        payload_temp_ids: set[str],
    ) -> tuple[list, list[_ConditionalEdgeSaveable], set[int]]:
        """Validate all ConditionalEdge items. Same return shape as _validate_edge_list."""
        errors = []
        saveables = []
        existing_refs: set[int] = set()

        db_map = {obj.id: obj for obj in ConditionalEdge.objects.filter(graph=graph)}

        for index, item_data in enumerate(incoming_list):
            item_data = dict(item_data)
            item_id = item_data.get("id")

            source_ref_error, source_ref = self._parse_node_ref(
                item_data, "source_node_id", "source_temp_id", payload_temp_ids, index
            )
            if source_ref_error:
                errors.append(source_ref_error)
                continue

            if source_ref and not source_ref[0]:
                existing_refs.add(source_ref[1])

            if item_id is None:
                item_data.pop("id", None)
                s = ConditionalEdgeBulkSerializer(data=item_data)
                if not s.is_valid():
                    errors.append({"index": index, "errors": s.errors})
                    continue
                saveables.append(_ConditionalEdgeSaveable(s, source_ref, instance=None))
            else:
                db_instance = db_map.get(item_id)
                if db_instance is None:
                    errors.append(
                        {
                            "index": index,
                            "errors": f"id={item_id} not found in graph {graph.id}",
                        }
                    )
                    continue

                item_data.pop("id", None)
                s = ConditionalEdgeBulkSerializer(db_instance, data=item_data)
                if not s.is_valid():
                    errors.append({"index": index, "errors": s.errors})
                    continue
                saveables.append(
                    _ConditionalEdgeSaveable(s, source_ref, instance=db_instance)
                )

        return errors, saveables, existing_refs

    @staticmethod
    def _parse_node_ref(
        item_data: dict,
        id_field: str,
        temp_field: str,
        payload_temp_ids: set[str],
        index: int,
    ) -> tuple[dict | None, tuple | None]:
        """Extract and validate one node ref from edge data. Returns (error, (is_temp, value))."""
        node_id = item_data.get(id_field)
        temp_id = item_data.get(temp_field)

        has_id = node_id is not None
        has_temp = temp_id is not None

        if has_id and has_temp:
            return (
                {
                    "index": index,
                    "errors": f"Provide exactly one of {id_field} or {temp_field}, not both.",
                },
                None,
            )
        if not has_id and not has_temp:
            return (
                {
                    "index": index,
                    "errors": f"One of {id_field} or {temp_field} is required.",
                },
                None,
            )

        if has_temp:
            temp_str = str(temp_id)
            if temp_str not in payload_temp_ids:
                return (
                    {
                        "index": index,
                        "errors": (
                            f"{temp_field}={temp_str!r} does not match any temp_id "
                            f"in the node lists of this request."
                        ),
                    },
                    None,
                )
            return None, (True, temp_str)

        return None, (False, node_id)

    def _validate_deletions(self, graph: Graph, deleted_data: dict) -> list[str]:
        """Verify all IDs in deleted dict belong to this graph. Returns error strings."""
        errors = []
        # edges first, then nodes — matches deletion order
        for config in [*EDGE_DELETE_CONFIGS, *NODE_TYPE_REGISTRY]:
            ids = deleted_data.get(config.delete_key) or []
            if not ids:
                continue
            found_ids = set(
                config.model_class.objects.filter(id__in=ids, graph=graph).values_list(
                    "id", flat=True
                )
            )
            invalid_ids = set(ids) - found_ids
            if invalid_ids:
                errors.append(
                    f"{config.delete_key}: IDs {sorted(invalid_ids)} not found in graph {graph.id}"
                )
        return errors

    @staticmethod
    def _collect_payload_temp_ids(validated_input: dict) -> set[str]:
        """Return all temp_id strings present in every node list. Derived from registry."""
        temp_ids: set[str] = set()
        for config in NODE_TYPE_REGISTRY:
            for item in validated_input.get(config.list_key, []):
                tid = item.get("temp_id")
                if tid is not None:
                    temp_ids.add(str(tid))
        return temp_ids

    @staticmethod
    def _find_nonexistent_global_node_ids(node_ids: set[int]) -> set[int]:
        """Return the subset of node_ids that do not exist in any BaseGlobalNode table."""
        if not node_ids:
            return set()

        node_models = [
            m
            for m in apps.get_models()
            if issubclass(m, BaseGlobalNode) and not m._meta.abstract
        ]
        if not node_models:
            return node_ids

        id_list = list(node_ids)
        placeholders = ",".join(["%s"] * len(id_list))
        union_parts = [
            f"SELECT id FROM {m._meta.db_table} WHERE id IN ({placeholders})"
            for m in node_models
        ]
        query = " UNION ALL ".join(union_parts)
        params = id_list * len(node_models)

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            found_ids = {row[0] for row in cursor.fetchall()}

        return node_ids - found_ids

    @transaction.atomic
    def _execute_writes(
        self,
        graph: Graph,
        deleted_data: dict,
        node_saveables: list[_NodeSaveable],
        edge_saveables: list,
    ):
        """Atomically delete, then save nodes, then save edges."""
        temp_id_map: dict[str, int] = {}

        self._execute_deletions(graph, deleted_data)

        # Nodes first — populates temp_id_map for new nodes.
        for ns in node_saveables:
            ns.save(temp_id_map)

        # Edges second — temp refs resolved from the complete map.
        for es in edge_saveables:
            es.resolve_and_save(temp_id_map)

    def _execute_deletions(self, graph: Graph, deleted_data: dict):
        """Delete all requested entities in edges-before-nodes order."""
        for config in [*EDGE_DELETE_CONFIGS, *NODE_TYPE_REGISTRY]:
            ids = deleted_data.get(config.delete_key) or []
            if ids:
                config.model_class.objects.filter(id__in=ids, graph=graph).delete()
