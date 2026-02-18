from copy import deepcopy

from tables.models import (
    LLMModel,
    EmbeddingModel,
    RealtimeModel,
    RealtimeTranscriptionModel,
    Provider,
)

from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.llm_models import (
    LLMModelImportSerializer,
    EmbeddingModelImportSerializer,
    RealtimeModelImportSerializer,
    RealtimeTranscriptionModelImportSerializer,
)
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import ensure_unique_identifier, create_filters


class BaseProviderModelStrategy(EntityImportExportStrategy):
    model_class = None
    serializer_class = None
    provider_filter_field = "provider__name"

    def get_instance(self, entity_id: int):
        return self.model_class.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance):
        return {}

    def create_entity(self, data, id_mapper: IDMapper):
        if "name" in data:
            existing_names = self.model_class.objects.values_list("name", flat=True)
            data["name"] = ensure_unique_identifier(
                base_name=data["name"],
                existing_names=existing_names,
            )

        provider = Provider.objects.get(name=data["provider_name"])
        serializer = self.serializer_class(data={**data, "provider_id": provider.id})
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def export_entity(self, instance) -> dict:
        return self.serializer_class(instance).data

    def find_existing(self, data, id_mapper):
        data_copy = deepcopy(data)
        data_copy.pop("id", None)
        provider_name = data_copy.pop("provider_name", None)

        filters, null_filters = create_filters(data_copy)

        return self.model_class.objects.filter(
            **filters,
            **null_filters,
            **{self.provider_filter_field: provider_name},
        ).first()


class LLMModelStrategy(BaseProviderModelStrategy):
    entity_type = EntityType.LLM_MODEL
    model_class = LLMModel
    serializer_class = LLMModelImportSerializer
    provider_filter_field = "llm_provider__name"


class EmbeddingModelStrategy(BaseProviderModelStrategy):
    entity_type = EntityType.EMBEDDING_MODEL
    model_class = EmbeddingModel
    serializer_class = EmbeddingModelImportSerializer
    provider_filter_field = "embedding_provider__name"


class RealtimeModelStrategy(BaseProviderModelStrategy):
    entity_type = EntityType.REALTIME_MODEL
    model_class = RealtimeModel
    serializer_class = RealtimeModelImportSerializer


class RealtimeTranscriptionModelStrategy(BaseProviderModelStrategy):
    entity_type = EntityType.REALTIME_TRANSCRIPTION_MODEL
    model_class = RealtimeTranscriptionModel
    serializer_class = RealtimeTranscriptionModelImportSerializer
