from tables.import_export.enums import NodeType
from tables.graph_versioning.handlers.null_fk_handler import NullFkHandler


class CodeAgentNodeHandler(NullFkHandler):
    node_type = NodeType.CODE_AGENT_NODE
    fk_field = "llm_config"
    missing_set_attr = "llm_configs"
    dependency_label = "LLMConfig"
