from copy import deepcopy

from tables.import_export.enums import EntityType
from tables.import_export.strategies.graph import GraphStrategy
from tables.import_export.id_mapper import IDMapper
from tables.import_export.constants import NODE_MAPPING_KEY

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

    def filter_snapshot(self, snapshot: dict, missing: dict) -> tuple[dict, list[dict]]:
        """
        Strip missing-dependency nodes, null orphaned FKs,
        and drop dangling edges, returning the pipeline-ready snapshot
        and warnings.
        """
        filtered_snapshot = deepcopy(snapshot)
        warnings: list[dict] = []

        missing_crews = set(missing.get(EntityType.CREW.value, []))
        missing_subgraphs = set(missing.get(EntityType.GRAPH.value, []))
        missing_llm_configs = set(missing.get(EntityType.LLM_CONFIG.value, []))
        missing_webhooks = set(missing.get(EntityType.WEBHOOK_TRIGGER.value, []))

        skipped_node_ids: set[int] = set()
        kept_nodes: list[dict] = []

        for node in filtered_snapshot.get("nodes", []):
            node_type = node.get("node_type")
            node_id = node.get("id")
            node_name = node.get("node_name") or node_type

            if node_type == "CrewNode":
                if node.get("crew") in missing_crews:
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
                if node.get("subgraph") in missing_subgraphs:
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
                if node.get("llm_config") in missing_llm_configs:
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
                if missing_id in missing_llm_configs:
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
                if missing_id in missing_webhooks:
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
                if missing_id in missing_webhooks:
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

        for node in kept_nodes:
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

        filtered_snapshot["nodes"] = kept_nodes

        kept_edges = []
        for edge in filtered_snapshot.get("edge_list", []):
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
        filtered_snapshot["edge_list"] = kept_edges

        kept_cond_edges = []
        for edge in filtered_snapshot.get("conditional_edge_list", []):
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
        filtered_snapshot["conditional_edge_list"] = kept_cond_edges

        return filtered_snapshot, warnings

    def apply_snapshot_to_graph(
        self, graph: Graph, data: dict, id_mapper: IDMapper
    ) -> dict:
        nodes_data = data.get("nodes", [])
        edges_data = data.get("edge_list", [])
        conditional_edges_data = data.get("conditional_edge_list", [])

        node_mapper = IDMapper()

        # TODO: how to not break convention by using protected methods

        # Pass 1: create all nodes and build the old→new node ID mapping
        self._graph_strategy._create_nodes(nodes_data, graph, node_mapper, id_mapper)

        # Pass 2: create edges/conditional-edges with remapped node IDs,
        # then fix stale node-ID references in decision tables and metadata
        self._graph_strategy._create_edges(edges_data, graph, node_mapper)
        self._graph_strategy._create_conditional_edges(
            conditional_edges_data, graph, node_mapper
        )
        self._graph_strategy._remap_decision_table_references(graph, node_mapper)
        self._graph_strategy._update_metadata_node_ids(graph, node_mapper)

        return {"node_id_map": node_mapper.get_id_map(NODE_MAPPING_KEY)}

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
