from rest_framework import serializers

from tables.serializers.model_serializers.llm_serializers import LLMConfigSerializer
from tables.serializers.model_serializers.python_serializers import PythonCodeSerializer
from tables.models.crew_models import Crew
from tables.serializers.model_serializers.crew_serializers import (
    CrewSerializer,
)
from tables.models.graph_models import (
    AudioTranscriptionNode,
    CodeAgentNode,
    CrewNode,
    Edge,
    FileExtractorNode,
    LLMNode,
    PythonNode,
    SubGraphNode,
)
from tables.serializers.base_serializer import (
    BaseGraphEntityMixin,
    ContentHashWritableMixin,
)
from tables.serializers.utils.mixins import NestedPythonCodeMixin


class CrewNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    crew = CrewSerializer(read_only=True)
    crew_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = CrewNode
        fields = "__all__"
        read_only_fields = ["crew"]

    def validate_crew_id(self, value):
        if not Crew.objects.only("id").filter(id=value).exists():
            raise serializers.ValidationError("Invalid crew_id: crew does not exist.")
        return value

    def update(self, instance, validated_data):
        if "crew_id" in validated_data:
            instance.crew_id = validated_data["crew_id"]
        return super().update(instance, validated_data)


class PythonNodeSerializer(
    ContentHashWritableMixin, NestedPythonCodeMixin, serializers.ModelSerializer
):
    python_code = PythonCodeSerializer()

    class Meta:
        model = PythonNode
        fields = "__all__"


class FileExtractorNodeSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    class Meta:
        model = FileExtractorNode
        fields = "__all__"


class AudioTranscriptionNodeSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    class Meta:
        model = AudioTranscriptionNode
        fields = "__all__"


class LLMNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta:
        model = LLMNode
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["llm_config_detail"] = LLMConfigSerializer(instance.llm_config).data
        return data


class CodeAgentNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeAgentNode
        fields = "__all__"


class EdgeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta(BaseGraphEntityMixin.Meta):
        model = Edge
        fields = "__all__"


class SubGraphNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta(BaseGraphEntityMixin.Meta):
        model = SubGraphNode
        fields = "__all__"

    def validate(self, attrs):
        graph = attrs.get("graph") or getattr(self.instance, "graph", None)
        subgraph = attrs.get("subgraph") or getattr(self.instance, "subgraph", None)

        if graph and subgraph and graph == subgraph:
            raise serializers.ValidationError("Graph and subgraph cannot be the same.")

        return attrs

    def to_representation(self, instance):
        from tables.serializers.model_serializers.graph_serializers import (
            GraphLightSerializer,
        )

        data = super().to_representation(instance)
        data["subgraph_detail"] = GraphLightSerializer(instance.subgraph).data
        return data
