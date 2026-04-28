from django.db import transaction

from tables.graph_versioning.strategy import GraphVersioningStrategy
from tables.models import (
    GraphVersion,
    Graph,
)


class GraphVersioningService:
    def __init__(self):
        self._strategy = GraphVersioningStrategy()

    def save_version(
        self, graph: Graph, name: str, description: str = ""
    ) -> GraphVersion:
        """
        Create a named version snapshot of the given graph.
        """
        snapshot = self._strategy.create_snapshot(graph)
        light_deps = self._strategy.collect_dependencies(graph)

        return GraphVersion.objects.create(
            graph=graph,
            name=name,
            description=description,
            snapshot=snapshot,
            dependencies=light_deps,
        )

    def restore_version(self, version: GraphVersion, *, backup: bool = False) -> dict:
        graph = version.graph
        snapshot = version.snapshot
        deps = version.dependencies or {}

        deps_validation = self._strategy.validate_dependencies(deps)
        filtered_snapshot, warnings = self._strategy.filter_snapshot(
            snapshot, deps_validation["missing"]
        )

        auto_backup_id = None
        if backup:
            backup_version = self.save_version(
                graph=graph,
                name=f"Before restore to '{version.name}'",
                description=f"Auto-backup created before restoring version #{version.id}",
            )
            auto_backup_id = backup_version.id

        with transaction.atomic():
            self._strategy._wipe_graph_children(graph)
            self._strategy._update_graph_scalars(graph, filtered_snapshot)

            id_mapper = self._strategy._build_identity_id_mapper(
                deps_validation["available"]
            )

            self._strategy.apply_snapshot_to_graph(
                graph,
                {
                    "nodes": filtered_snapshot.get("nodes", []),
                    "edge_list": filtered_snapshot.get("edge_list", []),
                    "conditional_edge_list": filtered_snapshot.get(
                        "conditional_edge_list", []
                    ),
                },
                id_mapper,
            )

        return {
            "restored": True,
            "graph_id": graph.id,
            "warnings": warnings,
            "auto_backup_version_id": auto_backup_id,
        }
