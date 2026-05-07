from django.db import transaction

from tables.graph_versioning.manager import GraphVersioningManager
from tables.import_export.constants import IMPORT_VERSION, NODE_MAPPING_KEY
from tables.models import (
    GraphVersion,
    Graph,
)


class GraphVersioningService:
    def __init__(self):
        self._manager = GraphVersioningManager()

    def save_version(
        self, graph: Graph, name: str, description: str = ""
    ) -> GraphVersion:
        """
        Create a named version snapshot of the given graph.
        """
        snapshot = self._manager.create_snapshot(graph)
        snapshot["version"] = IMPORT_VERSION
        light_deps = self._manager.collect_dependencies(graph)

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

        snapshot = self._manager.convert_snapshot_to_current_version(version.snapshot)

        deps_validation = self._manager.validate_dependencies(deps)
        filtered_snapshot, warnings = self._manager.filter_snapshot(
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
            node_mapper = self._manager.apply_snapshot_to_graph(
                graph, filtered_snapshot, deps_validation["available"]
            )

        self._manager.change_old_warnings_ids(warnings, node_mapper)

        return {
            "restored": True,
            "graph_id": graph.id,
            "warnings": warnings,
            "auto_backup_version_id": auto_backup_id,
        }
