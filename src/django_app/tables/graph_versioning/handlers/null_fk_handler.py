from tables.graph_versioning.handlers.base import MissingDependencyHandler


class NullFkHandler(MissingDependencyHandler):
    def handle(self, node: dict, missing_id: int) -> tuple[bool, dict]:
        node_type = node.get("node_type")
        node_name = node.get("node_name") or node_type
        node[self.fk_field] = None
        warning = {
            "type": "fk_nulled",
            "node_name": node_name,
            "node_type": node_type,
            "node_id": node.get("id"),
            "field": self.fk_field,
            "missing_id": missing_id,
            "reason": f"Referenced {self.dependency_label} #{missing_id} no longer exists.",
        }
        return False, warning
