from tables.models import SourceCollection
from tables.serializers.export_serializers import (
    AgentExportSerializer,
    CrewExportSerializer,
    GraphExportSerializer,
)
from tables.serializers.import_serializers import (
    AgentImportSerializer,
    CrewImportSerializer,
    GraphImportSerializer,
)


class AgentCopySerializer(AgentExportSerializer):
    pass


class AgentCopyDeserializer(AgentImportSerializer):

    class Meta(AgentImportSerializer.Meta):
        exclude = [
            "tags",
            "configured_tools",
            "python_code_tools",
        ]

    def create(self, validated_data):
        knowledge_collection_id = validated_data.pop("knowledge_collection", None)
        agent = super().create(validated_data)

        source_collection = SourceCollection.objects.filter(
            collection_id=knowledge_collection_id
        ).first()
        agent.knowledge_collection = source_collection
        agent.save()

        return agent


class CrewCopySerializer(CrewExportSerializer):
    pass


class CrewCopyDeserializer(CrewImportSerializer):

    class Meta(CrewImportSerializer.Meta):
        exclude = ["id", "tags"]

    def create(self, validated_data):
        knowledge_collection_id = validated_data.pop("knowledge_collection", None)
        crew = super().create(validated_data)

        source_collection = SourceCollection.objects.filter(
            collection_id=knowledge_collection_id
        ).first()
        crew.knowledge_collection = source_collection
        crew.save()

        return crew


class GraphCopySerializer(GraphExportSerializer):
    pass


class GraphCopyDeserializer(GraphImportSerializer):
    pass
