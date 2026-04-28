from copy import deepcopy
from dataclasses import dataclass

from tables.import_export.enums import EntityType
from tables.import_export.strategies.graph import GraphStrategy
from tables.import_export.id_mapper import IDMapper

from tables.graph_versioning.constants import (
    _DEPENDENCY_ENTITY_TYPES,
    _DEPENDENCY_MODELS,
    _GRAPH_SCALAR_FIELDS,
)
from tables.models import (
    Graph,
    ConditionalEdge,
    PythonCode,
    PythonCodeTool,
    PythonNode,
    WebhookTriggerNode,
)


@dataclass
class _MissingSets:
    """Dataclass that holds all missing deps"""

    crews: set
    subgraphs: set
    llm_configs: set
    webhooks: set


class GraphVersioningStrategy:
    """
    Reuses GraphStrategy's serialization to produce a graph-only snapshot
    for versioning purposes. No dependency tree traversal.
    """

    def __init__(self):
        self._graph_strategy = GraphStrategy()

    def create_snapshot(self, graph: Graph) -> dict:
        """
        Serialize the graph's internal state (metadata, nodes, edges,
        conditional edges) into a JSON-serializable dict.
        """
        return self._graph_strategy.export_entity(graph)

    def collect_dependencies(self, graph: Graph) -> dict:
        """
        Build a lightweight manifest of external dependency IDs
        the graph currently references. No full serialization — just IDs.
        """
        raw_deps = self._graph_strategy.extract_dependencies_from_instance(graph)
        light_deps = {
            str(entity_type.value): list(ids)
            for entity_type, ids in raw_deps.items()
            if ids
        }
        return light_deps

    def validate_dependencies(self, dependencies: dict) -> dict:
        """
        Split dependency IDs into available/missing buckets via bulk DB lookups,
        keyed by EntityType.value strings.
        """
        available_deps: dict[str, list[int]] = {}
        missing_deps: dict[str, list[int]] = {}

        for entity_type_value, ids in dependencies.items():
            model = _DEPENDENCY_MODELS.get(entity_type_value)
            if model is None or not ids:
                available_deps[entity_type_value] = []
                missing_deps[entity_type_value] = []
                continue

            existing_ids = set(
                model.objects.filter(id__in=ids).values_list("id", flat=True)
            )
            available_deps[entity_type_value] = [i for i in ids if i in existing_ids]
            missing_deps[entity_type_value] = [i for i in ids if i not in existing_ids]

        return {"available": available_deps, "missing": missing_deps}

    def _build_missing_sets(self, missing: dict) -> _MissingSets:
        """Gather all missing dependencies ids into dataclass structure"""
        return _MissingSets(
            crews=set(missing.get(EntityType.CREW.value, [])),
            subgraphs=set(missing.get(EntityType.GRAPH.value, [])),
            llm_configs=set(missing.get(EntityType.LLM_CONFIG.value, [])),
            webhooks=set(missing.get(EntityType.WEBHOOK_TRIGGER.value, [])),
        )

    def _filter_nodes(
        self, nodes: list[dict], missing_sets: _MissingSets
    ) -> tuple[list[dict], set[int], list[dict]]:
        """Checks all graph nodes that rely on dependencies and skip them"""

        kept_nodes: list[dict] = []
        skipped_node_ids: set[int] = set()
        warnings: list[dict] = []

        for node in nodes:
            node_type = node.get("node_type")
            node_id = node.get("id")
            node_name = node.get("node_name") or node_type

            if node_type == "CrewNode":
                if node.get("crew") in missing_sets.crews:
                    skipped_node_ids.add(node_id)
                    warnings.append(
                        {
                            "type": "node_skipped",
                            "node_name": node_name,
                            "node_type": node_type,
                            "reason": f"Referenced Crew #{node.get('crew')} no longer exists.",
                        }
                    )
                    continue

            elif node_type == "SubgraphNode":
                if node.get("subgraph") in missing_sets.subgraphs:
                    skipped_node_ids.add(node_id)
                    warnings.append(
                        {
                            "type": "node_skipped",
                            "node_name": node_name,
                            "node_type": node_type,
                            "reason": f"Referenced subgraph #{node.get('subgraph')} no longer exists.",
                        }
                    )
                    continue

            elif node_type == "LLMNode":
                if node.get("llm_config") in missing_sets.llm_configs:
                    skipped_node_ids.add(node_id)
                    warnings.append(
                        {
                            "type": "node_skipped",
                            "node_name": node_name,
                            "node_type": node_type,
                            "reason": f"Referenced LLMConfig #{node.get('llm_config')} no longer exists.",
                        }
                    )
                    continue

            elif node_type == "CodeAgentNode":
                missing_id = node.get("llm_config")
                if missing_id in missing_sets.llm_configs:
                    node["llm_config"] = None
                    warnings.append(
                        {
                            "type": "fk_nulled",
                            "node_name": node_name,
                            "node_type": node_type,
                            "field": "llm_config",
                            "missing_id": missing_id,
                        }
                    )

            elif node_type == "WebhookTriggerNode":
                missing_id = node.get("webhook_trigger")
                if missing_id in missing_sets.webhooks:
                    node["webhook_trigger"] = None
                    warnings.append(
                        {
                            "type": "fk_nulled",
                            "node_name": node_name,
                            "node_type": node_type,
                            "field": "webhook_trigger",
                            "missing_id": missing_id,
                        }
                    )

            elif node_type == "TelegramTriggerNode":
                missing_id = node.get("webhook_trigger")
                if missing_id in missing_sets.webhooks:
                    node["webhook_trigger"] = None
                    warnings.append(
                        {
                            "type": "fk_nulled",
                            "node_name": node_name,
                            "node_type": node_type,
                            "field": "webhook_trigger",
                            "missing_id": missing_id,
                        }
                    )

            kept_nodes.append(node)

        return kept_nodes, skipped_node_ids, warnings

    def _clean_decision_table_refs(
        self, snapshot_nodes: list[dict], skipped_node_ids: set[int]
    ) -> list[dict]:
        """
        Check DecisionTableNode connections.
        Set None if related entity doesn't exist
        """
        warnings: list[dict] = []

        for node in snapshot_nodes:
            if node.get("node_type") != "DecisionTableNode":
                continue
            node_name = node.get("node_name") or "DecisionTableNode"
            for field in ("default_next_node_id", "next_error_node_id"):
                target = node.get(field)
                if target in skipped_node_ids:
                    node[field] = None
                    warnings.append(
                        {
                            "type": "decision_table_ref_cleared",
                            "node_name": node_name,
                            "field": field,
                            "missing_node_id": target,
                        }
                    )

            for group in node.get("condition_groups", []) or []:
                target = group.get("next_node_id")
                if target in skipped_node_ids:
                    group["next_node_id"] = None
                    warnings.append(
                        {
                            "type": "decision_table_ref_cleared",
                            "node_name": node_name,
                            "field": f"condition_groups[{group.get('group_name')}].next_node_id",
                            "missing_node_id": target,
                        }
                    )

        return warnings

    def _filter_edges(
        self, edges: list[dict], skipped_node_ids: set[int]
    ) -> tuple[list[dict], list[dict]]:
        """
        Filter all edges based on non existing nodes
        """

        kept_edges = []
        warnings = []

        for edge in edges:
            start = edge.get("start_node_id")
            end = edge.get("end_node_id")
            if start in skipped_node_ids or end in skipped_node_ids:
                warnings.append(
                    {
                        "type": "edge_dropped",
                        "reason": f"Edge {start}->{end} references a skipped node.",
                    }
                )
                continue
            kept_edges.append(edge)

        return kept_edges, warnings

    def _filter_conditional_edges(
        self, conditional_edges: list[dict], skipped_node_ids: set[int]
    ) -> tuple[list[dict], list[dict]]:
        """
        Filter conditional edges based on non existing nodes
        """
        kept_cond_edges = []
        warnings = []
        for edge in conditional_edges:
            source = edge.get("source_node_id")
            if source in skipped_node_ids:
                warnings.append(
                    {
                        "type": "edge_dropped",
                        "reason": f"Conditional edge from {source} references a skipped node.",
                    }
                )
                continue
            kept_cond_edges.append(edge)

        return kept_cond_edges, warnings

    def filter_snapshot(self, snapshot: dict, missing: dict) -> tuple[dict, list[dict]]:
        """
        Strip missing-dependency nodes, null orphaned FKs,
        and drop dangling edges, returning the pipeline-ready snapshot
        and warnings.
        """
        filtered_snapshot = deepcopy(snapshot)
        warnings: list[dict] = []

        missing_sets = self._build_missing_sets(missing)

        kept_nodes, skipped_node_ids, node_warnings = self._filter_nodes(
            filtered_snapshot.get("nodes", []), missing_sets
        )
        filtered_snapshot["nodes"] = kept_nodes
        warnings.extend(node_warnings)

        warnings.extend(
            self._clean_decision_table_refs(
                filtered_snapshot["nodes"], skipped_node_ids
            )
        )

        kept_edges, edge_warnings = self._filter_edges(
            filtered_snapshot.get("edge_list", []), skipped_node_ids
        )
        filtered_snapshot["edge_list"] = kept_edges
        warnings.extend(edge_warnings)

        kept_cond_edges, cond_warnings = self._filter_conditional_edges(
            filtered_snapshot.get("conditional_edge_list", []), skipped_node_ids
        )
        filtered_snapshot["conditional_edge_list"] = kept_cond_edges
        warnings.extend(cond_warnings)

        return filtered_snapshot, warnings

    def apply_snapshot_to_graph(
        self, graph: Graph, data: dict, id_mapper: IDMapper
    ) -> None:
        self._graph_strategy.recreate_graph_children(graph, data, id_mapper)

    def _wipe_graph_children(self, graph: Graph) -> None:
        """
        Wipe all graph related nodes
        """
        python_code_ids: set[int] = set()
        python_code_ids.update(
            PythonNode.objects.filter(graph=graph).values_list(
                "python_code_id", flat=True
            )
        )
        python_code_ids.update(
            ConditionalEdge.objects.filter(graph=graph).values_list(
                "python_code_id", flat=True
            )
        )
        python_code_ids.update(
            WebhookTriggerNode.objects.filter(graph=graph).values_list(
                "python_code_id", flat=True
            )
        )

        for relation_name in (
            "crew_node_list",
            "subgraph_node_list",
            "python_node_list",
            "llm_node_list",
            "webhook_trigger_node_list",
            "file_extractor_node_list",
            "audio_transcription_node_list",
            "start_node_list",
            "decision_table_node_list",
            "telegram_trigger_node_list",
            "end_node",
            "graph_note_list",
            "code_agent_node_list",
            "edge_list",
            "conditional_edge_list",
        ):
            getattr(graph, relation_name).all().delete()

        if python_code_ids:
            shared_ids = set(
                PythonCodeTool.objects.filter(
                    python_code_id__in=python_code_ids
                ).values_list("python_code_id", flat=True)
            )
            orphan_ids = python_code_ids - shared_ids
            if orphan_ids:
                PythonCode.objects.filter(id__in=orphan_ids).delete()

    def _update_graph_scalars(self, graph: Graph, snapshot: dict) -> None:
        """
        Updates graphs fields from version snapshot
        """
        update_fields = []
        for field in _GRAPH_SCALAR_FIELDS:
            if field in snapshot:
                setattr(graph, field, snapshot[field])
                update_fields.append(field)
        if update_fields:
            graph.save(update_fields=update_fields)

    def _build_identity_id_mapper(self, available_deps: dict) -> IDMapper:
        id_mapper = IDMapper()
        for entity_type_value, ids in available_deps.items():
            entity_type = _DEPENDENCY_ENTITY_TYPES.get(entity_type_value)
            if entity_type is None:
                continue
            for entity_id in ids:
                id_mapper.map(entity_type, entity_id, entity_id, was_created=False)
        return id_mapper
