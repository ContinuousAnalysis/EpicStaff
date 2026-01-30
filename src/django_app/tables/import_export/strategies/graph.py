from copy import deepcopy

from tables.models import Graph, Crew
from tables.serializers.model_serializers import CrewSerializer
from tables.import_export.strategies.base import EntityImportStrategy
from tables.import_export.serializers.graph import (
    GraphSerializer,
    EndNodeSerializer,
    EdgeSerializer,
)
from tables.import_export.enums import EntityType, NodeType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import ensure_unique_identifier
from tables.import_export.strategies.node_handlers import NODE_HANDLERS


class GraphStrategy(EntityImportStrategy):

    entity_type = EntityType.GRAPH
    serializer_class = GraphSerializer

    def get_instance(self, entity_id: int) -> Graph:
        return Graph.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(
        self, instance: Graph
    ) -> dict[str, list[int]]:
        deps = {}
        deps[EntityType.CREW] = list(
            instance.crew_node_list.values_list("crew_id", flat=True)
        )
        return deps

    def export_entity(self, instance: Graph) -> dict:
        data = self.serializer_class(instance).data
        data["nodes"] = self._export_nodes(instance)
        return data

    def create_entity(self, data: dict, id_mapper: IDMapper) -> Graph:
        import_data = data.copy()
        import_data["metadata"] = self._update_metadata(
            import_data["metadata"], id_mapper
        )

        if "name" in import_data:
            existing_names = Graph.objects.values_list("name", flat=True)
            import_data["name"] = ensure_unique_identifier(
                base_name=data["name"],
                existing_names=existing_names,
            )

        nodes_data = import_data.pop("nodes", [])
        edges_data = import_data.pop("edge_list", [])

        serializer = self.serializer_class(data=import_data)
        serializer.is_valid(raise_exception=True)
        graph = serializer.save()

        node_map = self._create_nodes(nodes_data, graph, id_mapper)
        self._create_edges(edges_data, graph, node_map)

        return graph

    def _export_nodes(self, instance: Graph) -> list:
        nodes = []

        for node_type, config in NODE_HANDLERS.items():
            relation_name = config["relation"]
            serializer_class = config["serializer"]

            node_queryset = getattr(instance, relation_name).all()

            for node in node_queryset:
                node_data = serializer_class(node).data
                node_data["node_type"] = node_type
                nodes.append(node_data)

        return nodes

    def _create_nodes(
        self, nodes_data: list, graph: Graph, id_mapper: IDMapper
    ) -> dict:
        node_map = {}

        for node_data in nodes_data:
            node_type = node_data.pop("node_type")
            node_name = node_data.get("node_name")

            if node_type == NodeType.START_NODE:
                node_name = "__start__"
            elif node_type == NodeType.END_NODE:
                node_name = "__end_node__"

            config = NODE_HANDLERS[node_type]

            if "import_hook" in config:
                node = config["import_hook"](graph, node_data, id_mapper)
            else:
                node = self._default_import_node(graph, node_data, config)

            node_map[node_name] = node

        return node_map

    def _create_edges(self, edges_data: list, graph: Graph, node_map: dict):
        for edge_data in edges_data:
            start_key = edge_data.pop("start_key")
            end_key = edge_data.pop("end_key")

            edge_data["start_key"] = node_map[start_key].id
            edge_data["end_key"] = node_map[end_key].id
            edge_data["graph"] = graph.id

            serializer = EdgeSerializer(data=edge_data)
            serializer.is_valid(raise_exception=True)
            serializer.save()

    def _default_import_node(self, graph: Graph, node_data: dict, config: dict):
        """Default import logic for simple nodes"""
        serializer_class = config["serializer"]
        node_data["graph"] = graph.id

        serializer = serializer_class(data=node_data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def _update_metadata(self, metadata: dict, id_mapper: IDMapper) -> dict:
        # TODO: Remove metadat when save functionality reworked
        metadata_copy = deepcopy(metadata)

        nodes = metadata_copy.get("nodes", [])
        for node in nodes:
            if node["type"] == "project":
                old_id = node["data"]["id"]
                new_id = id_mapper.get_or_none(EntityType.CREW, old_id)
                crew = Crew.objects.get(id=new_id)

                node["data"] = CrewSerializer(instance=crew).data

        return metadata_copy
