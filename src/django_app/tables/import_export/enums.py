from enum import Enum


class EntityType(str, Enum):

    LLM_CONFIG = "LLMConfig"
    EMBEDDING_CONFIG = "EmbeddingConfig"
    REALTIME_CONFIG = "RealtimeConfig"
    REALTIME_TRANSCRIPTION_CONFIG = "RealtimeTranscriptionConfig"

    PYTHON_CODE_TOOL = "PythonCodeTool"
    MCP_TOOL = "MCPTool"

    REALTIME_AGENT = "RealtimeAgent"

    AGENT = "Agent"
    CREW = "Project"
    GRAPH = "Flow"
