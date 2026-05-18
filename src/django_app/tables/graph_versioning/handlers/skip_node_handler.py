from tables.graph_versioning.handlers.base import MissingDependencyHandler


class SkipNodeHandler(MissingDependencyHandler):
    def handle(self, node: dict, missing_id: int) -> tuple[bool, dict]:
        node_type = node.get("node_type")
        node_name = node.get("node_name") or node_type
        warning = {
            "type": "node_skipped",
            "node_name": node_name,
            "node_type": node_type,
            "reason": f"Referenced {self.dependency_label} #{missing_id} no longer exists.",
        }
        return True, warning
