from django.db import transaction

from tables.graph_versioning.strategy import GraphVersioningStrategy
from tables.import_export.constants import IMPORT_VERSION
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
        snapshot["version"] = IMPORT_VERSION
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
        deps = version.dependencies or {}

        snapshot = self._strategy.convert_snapshot_to_current_version(version.snapshot)

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
            self._strategy.apply_snapshot_to_graph(
                graph, filtered_snapshot, deps_validation["available"]
            )

        return {
            "restored": True,
            "graph_id": graph.id,
            "warnings": warnings,
            "auto_backup_version_id": auto_backup_id,
        }
