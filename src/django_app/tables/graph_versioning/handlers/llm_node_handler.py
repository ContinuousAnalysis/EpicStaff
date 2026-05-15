from tables.import_export.enums import NodeType
from tables.graph_versioning.handlers.skip_node_handler import SkipNodeHandler


class LLMNodeHandler(SkipNodeHandler):
    node_type = NodeType.LLM_NODE
    fk_field = "llm_config"
    missing_set_attr = "llm_configs"
    dependency_label = "LLMConfig"
