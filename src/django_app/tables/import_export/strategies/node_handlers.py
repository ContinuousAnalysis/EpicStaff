from tables.models import (
    PythonNode,
    CrewNode,
    Graph,
    WebhookTriggerNode,
    EndNode,
    WebhookTrigger,
)
from tables.import_export.enums import NodeType, EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.serializers.python_tools import PythonCodeImportSerializer
from tables.import_export.serializers.graph import (
    StartNodeImportSerializer,
    CrewNodeImportSerializer,
    PythonNodeImportSerializer,
    LLMNodeImportSerializer,
    WebhookTriggerNodeImportSerializer,
    FileExtractorNodeImportSerializer,
    AudioTranscriptionNodeImportSerializer,
    DecisionTableNodeImportSerializer,
    TelegramTriggerNodeImportSerializer,
    EndNodeImportSerializer,
)


def import_python_node(
    graph: Graph, node_data: dict, id_mapper: IDMapper
) -> PythonNode:
    python_code_data = node_data.pop("python_code", None)

    serializer = PythonCodeImportSerializer(data=python_code_data)
    serializer.is_valid(raise_exception=True)
    python_code = serializer.save()

    serializer = PythonNodeImportSerializer(
        data={**node_data, "graph": graph.id, "python_code_id": python_code.id}
    )
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_crew_node(graph: Graph, node_data: dict, id_mapper: IDMapper) -> CrewNode:
    crew_id = node_data.pop("crew", None)

    new_crew_id = id_mapper.get_or_none(EntityType.CREW, crew_id)
    node_data["crew"] = new_crew_id

    serializer = CrewNodeImportSerializer(data={**node_data, "graph": graph.id})
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_webhook_trigger_node(
    graph: Graph, node_data: dict, id_mapper: IDMapper
) -> WebhookTriggerNode:
    python_code_data = node_data.pop("python_code", None)
    old_trigger_id = node_data.pop("webhook_trigger", None)
    new_trigger_id = id_mapper.get_or_none(EntityType.WEBHOOK_TRIGGER, old_trigger_id)

    webhook_trigger = WebhookTrigger.objects.get(id=new_trigger_id)

    python_code_serializer = PythonCodeImportSerializer(data=python_code_data)
    python_code_serializer.is_valid(raise_exception=True)
    python_code = python_code_serializer.save()

    serializer = WebhookTriggerNodeImportSerializer(
        data={
            **node_data,
            "graph": graph.id,
            "python_code_id": python_code.id,
            "webhook_trigger_id": webhook_trigger.id,
        }
    )
    serializer.is_valid(raise_exception=True)
    return serializer.save()


def import_end_node(graph: Graph, node_data: dict, id_mapper: IDMapper) -> EndNode:
    serializer = EndNodeImportSerializer(data={**node_data, "graph": graph.id})
    serializer.is_valid(raise_exception=True)
    return serializer.save()


NODE_HANDLERS = {
    NodeType.CREW_NODE: {
        "serializer": CrewNodeImportSerializer,
        "relation": "crew_node_list",
        "import_hook": import_crew_node,
    },
    NodeType.PYTHON_NODE: {
        "serializer": PythonNodeImportSerializer,
        "relation": "python_node_list",
        "import_hook": import_python_node,
    },
    NodeType.LLM_NODE: {
        "serializer": LLMNodeImportSerializer,
        "relation": "llm_node_list",
    },
    NodeType.WEBHOOK_TRIGGER_NODE: {
        "serializer": WebhookTriggerNodeImportSerializer,
        "relation": "webhook_trigger_node_list",
        "import_hook": import_webhook_trigger_node,
    },
    NodeType.FILE_EXTRACTOR_NODE: {
        "serializer": FileExtractorNodeImportSerializer,
        "relation": "file_extractor_node_list",
    },
    NodeType.AUDIO_TRANSCRIPTION_NODE: {
        "serializer": AudioTranscriptionNodeImportSerializer,
        "relation": "audio_transcription_node_list",
    },
    NodeType.START_NODE: {
        "serializer": StartNodeImportSerializer,
        "relation": "start_node_list",
    },
    NodeType.DECISION_TABLE_NODE: {
        "serializer": DecisionTableNodeImportSerializer,
        "relation": "decision_table_node_list",
    },
    NodeType.TELEGRAM_TRIGGER_NODE: {
        "serializer": TelegramTriggerNodeImportSerializer,
        "relation": "telegram_trigger_node_list",
    },
    NodeType.END_NODE: {
        "serializer": EndNodeImportSerializer,
        "relation": "end_node",
        "import_hook": import_end_node,
    },
}
