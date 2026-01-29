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


class NodeType(str, Enum):

    START_NODE = "StartNode"
    CREW_NODE = "CrewNode"
    PYTHON_NODE = "PythonNode"
    LLM_NODE = "LLMNode"
    AUDIO_TRANSCRIPTION_NODE = "AudioTranscriptionNode"
    FILE_EXTRACTOR_NODE = "FileExtractorNode"
    TELEGRAM_TRIGGER_NODE = "TelegramTriggerNode"
    WEBHOOK_TRIGGER_NODE = "WebhookTriggerNode"
    DECISION_TABLE_NODE = "DecisionTableNode"
    END_NODE = "EndNode"
