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
)
from tables.import_export.serializers.python_tools import PythonCodeSerializer


class BaseNodeSerializer(serializers.ModelSerializer):

    node_type = serializers.CharField(required=False)
    graph = serializers.PrimaryKeyRelatedField(
        queryset=Graph.objects.all(), write_only=True
    )

    class Meta:
        model = None
        fields = "__all__"


class StartNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = StartNode
        fields = "__all__"


class WebhookTriggerNodeSerializer(BaseNodeSerializer):

    python_code = PythonCodeSerializer(required=False)
    python_code_id = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        source="python_code",
        write_only=True,
    )

    class Meta(BaseNodeSerializer.Meta):
        model = WebhookTriggerNode
        fields = "__all__"


class DecisionTableNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = DecisionTableNode
        fields = "__all__"


class TelegramTriggerNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = TelegramTriggerNode
        fields = "__all__"


class PythonNodeSerializer(BaseNodeSerializer):

    python_code = PythonCodeSerializer(read_only=True)
    python_code_id = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        source="python_code",
        write_only=True,
    )

    class Meta(BaseNodeSerializer.Meta):
        model = PythonNode
        fields = "__all__"


class EndNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = EndNode
        fields = "__all__"


class FileExtractorNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = FileExtractorNode
        fields = "__all__"


class AudioTranscriptionNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = AudioTranscriptionNode
        fields = "__all__"


class LLMNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = LLMNode
        fields = "__all__"


class CrewNodeSerializer(BaseNodeSerializer):

    class Meta(BaseNodeSerializer.Meta):
        model = CrewNode
        fields = "__all__"


class EdgeSerializer(serializers.ModelSerializer):

    class Meta:
        model = Edge
        fields = "__all__"


class GraphSerializer(serializers.ModelSerializer):

    edge_list = EdgeSerializer(many=True, read_only=True)
    nodes = serializers.JSONField(required=False)

    class Meta:
        model = Graph
        exclude = ["tags"]
