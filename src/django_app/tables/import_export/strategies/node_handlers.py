from tables.models import PythonNode, CrewNode, Graph, WebhookTriggerNode, EndNode
from tables.import_export.enums import NodeType, EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.serializers.python_tools import PythonCodeSerializer
from tables.import_export.serializers.graph import (
    StartNodeSerializer,
    CrewNodeSerializer,
    PythonNodeSerializer,
    LLMNodeSerializer,
    WebhookTriggerNodeSerializer,
    FileExtractorNodeSerializer,
    AudioTranscriptionNodeSerializer,
    DecisionTableNodeSerializer,
    TelegramTriggerNodeSerializer,
    EndNodeSerializer,
)


def import_python_node(
    graph: Graph, node_data: dict, id_mapper: IDMapper
) -> PythonNode:
    python_code_data = node_data.pop("python_code", None)

    serializer = PythonCodeSerializer(data=python_code_data)
    serializer.is_valid(raise_exception=True)
    python_code = serializer.save()

    serializer = PythonNodeSerializer(
        data={**node_data, "graph": graph.id, "python_code_id": python_code.id}
    )
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_crew_node(graph: Graph, node_data: dict, id_mapper: IDMapper) -> CrewNode:
    crew_id = node_data.pop("crew", None)

    new_crew_id = id_mapper.get_or_none(EntityType.CREW, crew_id)
    node_data["crew"] = new_crew_id

    serializer = CrewNodeSerializer(data={**node_data, "graph": graph.id})
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_webhook_trigger_node(
    graph: Graph, node_data: dict, id_mapper: IDMapper
) -> WebhookTriggerNode:
    python_code_data = node_data.pop("python_code", None)

    serializer = PythonCodeSerializer(data=python_code_data)
    serializer.is_valid(raise_exception=True)
    python_code = serializer.save()

    serializer = WebhookTriggerNodeSerializer(
        data={**node_data, "graph": graph.id, "python_code_id": python_code.id}
    )
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_end_node(graph: Graph, node_data: dict, id_mapper: IDMapper) -> EndNode:
    serializer = EndNodeSerializer(data={**node_data, "graph": graph.id})
    serializer.is_valid(raise_exception=True)
    return serializer.save()


NODE_HANDLERS = {
    NodeType.CREW_NODE: {
        "serializer": CrewNodeSerializer,
        "relation": "crew_node_list",
        "import_hook": import_crew_node,
    },
    NodeType.PYTHON_NODE: {
        "serializer": PythonNodeSerializer,
        "relation": "python_node_list",
        "import_hook": import_python_node,
    },
    NodeType.LLM_NODE: {
        "serializer": LLMNodeSerializer,
        "relation": "llm_node_list",
    },
    NodeType.WEBHOOK_TRIGGER_NODE: {
        "serializer": WebhookTriggerNodeSerializer,
        "relation": "webhook_trigger_node_list",
        "import_hook": import_webhook_trigger_node,
    },
    NodeType.FILE_EXTRACTOR_NODE: {
        "serializer": FileExtractorNodeSerializer,
        "relation": "file_extractor_node_list",
    },
    NodeType.AUDIO_TRANSCRIPTION_NODE: {
        "serializer": AudioTranscriptionNodeSerializer,
        "relation": "audio_transcription_node_list",
    },
    NodeType.START_NODE: {
        "serializer": StartNodeSerializer,
        "relation": "start_node_list",
    },
    NodeType.DECISION_TABLE_NODE: {
        "serializer": DecisionTableNodeSerializer,
        "relation": "decision_table_node_list",
    },
    NodeType.TELEGRAM_TRIGGER_NODE: {
        "serializer": TelegramTriggerNodeSerializer,
        "relation": "telegram_trigger_node_list",
    },
    NodeType.END_NODE: {
        "serializer": EndNodeSerializer,
        "relation": "end_node",
        "import_hook": import_end_node,
    },
}
