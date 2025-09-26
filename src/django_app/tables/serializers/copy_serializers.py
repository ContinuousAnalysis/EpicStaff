from rest_framework import serializers
from tables.models import SourceCollection, Agent
from tables.serializers.export_serializers import (
    AgentExportSerializer,
    NestedAgentExportSerializer,
    CrewExportSerializer,
    GraphExportSerializer,
)
from tables.serializers.import_serializers import (
    AgentImportSerializer,
    NestedAgentImportSerializer,
    CrewImportSerializer,
    GraphImportSerializer,
)
from tables.serializers.utils.mixins import (
    NestedAgentExportMixin,
    NestedAgentImportMixin,
)


class AgentCopySerializer(AgentExportSerializer):

    knowledge_collection = serializers.PrimaryKeyRelatedField(
        queryset=SourceCollection.objects.all(), allow_null=True, required=False
    )

    class Meta(AgentExportSerializer.Meta):
        exclude = [
            "python_code_tools",
            "configured_tools",
        ]


class AgentCopyDeserializer(AgentImportSerializer):

    knowledge_collection = serializers.IntegerField(required=False, allow_null=True)

    class Meta(AgentImportSerializer.Meta):
        exclude = [
            "tags",
            "configured_tools",
            "python_code_tools",
        ]

    def create(self, validated_data):
        knowledge_collection_id = validated_data.pop("knowledge_collection", None)
        agent = super().create(validated_data)
        agent.knowledge_collection = SourceCollection.objects.filter(
            collection_id=knowledge_collection_id
        ).first()
        agent.save()

        return agent


class NestedAgentCopySerializer(NestedAgentExportMixin, AgentCopySerializer):

    knowledge_collection = serializers.PrimaryKeyRelatedField(
        queryset=SourceCollection.objects.all(), allow_null=True, required=False
    )


class NestedAgentCopyDeserializer(NestedAgentImportMixin, AgentCopyDeserializer):

    knowledge_collection = serializers.IntegerField(required=False, allow_null=True)


class CrewCopySerializer(CrewExportSerializer):

    knowledge_collection = serializers.PrimaryKeyRelatedField(
        queryset=SourceCollection.objects.all(), allow_null=True, required=False
    )

    agent_serializer_class = NestedAgentCopySerializer

    class Meta(CrewExportSerializer.Meta):
        exclude = ["id", "tags"]


class CrewCopyDeserializer(CrewImportSerializer):

    agents = NestedAgentCopyDeserializer(many=True, required=False)
    knowledge_collection = serializers.IntegerField(required=False, allow_null=True)

    agent_serializer_class = NestedAgentCopyDeserializer

    class Meta(CrewImportSerializer.Meta):
        exclude = ["id", "tags"]

    def create(self, validated_data):
        knowledge_collection_id = validated_data.pop("knowledge_collection", None)
        crew = super().create(validated_data)
        crew.knowledge_collection = SourceCollection.objects.filter(
            collection_id=knowledge_collection_id
        ).first()
        crew.save()

        return crew


class GraphCopySerializer(GraphExportSerializer):
    pass


class GraphCopyDeserializer(GraphImportSerializer):
    pass
