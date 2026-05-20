from tables.import_export.enums import NodeType
from tables.graph_versioning.handlers.skip_node_handler import SkipNodeHandler


class CrewNodeHandler(SkipNodeHandler):
    node_type = NodeType.CREW_NODE
    fk_field = "crew"
    missing_set_attr = "crews"
    dependency_label = "Project"
