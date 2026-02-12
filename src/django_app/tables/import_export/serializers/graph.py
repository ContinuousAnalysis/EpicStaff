from rest_framework import serializers

from tables.models import (
    Graph,
    EndNode,
    StartNode,
    PythonNode,
    DecisionTableNode,
    CrewNode,
    LLMNode,
    FileExtractorNode,
    WebhookTriggerNode,
    TelegramTriggerNode,
    AudioTranscriptionNode,
    Edge,
    PythonCode,
    WebhookTrigger,
)
from tables.import_export.serializers.python_tools import PythonCodeImportSerializer


class BaseNodeImportSerializer(serializers.ModelSerializer):
    node_type = serializers.CharField(required=False)
    graph = serializers.PrimaryKeyRelatedField(
        queryset=Graph.objects.all(), write_only=True
    )

    class Meta:
        model = None
        fields = "__all__"


class StartNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = StartNode
        fields = "__all__"


class WebhookTriggerNodeImportSerializer(BaseNodeImportSerializer):
    python_code = PythonCodeImportSerializer(required=False)
    python_code_id = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        source="python_code",
        write_only=True,
    )
    webhook_trigger_id = serializers.PrimaryKeyRelatedField(
        queryset=WebhookTrigger.objects.all(),
        source="webhook_trigger",
        write_only=True,
    )

    class Meta(BaseNodeImportSerializer.Meta):
        model = WebhookTriggerNode
        fields = "__all__"


class DecisionTableNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = DecisionTableNode
        fields = "__all__"


class TelegramTriggerNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = TelegramTriggerNode
        fields = "__all__"


class PythonNodeImportSerializer(BaseNodeImportSerializer):
    python_code = PythonCodeImportSerializer(read_only=True)
    python_code_id = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        source="python_code",
        write_only=True,
    )

    class Meta(BaseNodeImportSerializer.Meta):
        model = PythonNode
        fields = "__all__"


class EndNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = EndNode
        fields = "__all__"


class FileExtractorNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = FileExtractorNode
        fields = "__all__"


class AudioTranscriptionNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = AudioTranscriptionNode
        fields = "__all__"


class LLMNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = LLMNode
        fields = "__all__"


class CrewNodeImportSerializer(BaseNodeImportSerializer):
    class Meta(BaseNodeImportSerializer.Meta):
        model = CrewNode
        fields = "__all__"


class EdgeImportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = "__all__"


class GraphImportSerializer(serializers.ModelSerializer):
    edge_list = EdgeImportSerializer(many=True, read_only=True)
    nodes = serializers.JSONField(required=False)

    class Meta:
        model = Graph
        exclude = ["tags"]
