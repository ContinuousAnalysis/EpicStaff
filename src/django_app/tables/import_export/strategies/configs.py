from copy import deepcopy

from tables.models import (
    LLMConfig,
    EmbeddingConfig,
    RealtimeConfig,
    RealtimeTranscriptionConfig,
    LLMModel,
    EmbeddingModel,
    RealtimeModel,
    RealtimeTranscriptionModel,
)
from tables.import_export.strategies.base import EntityImportStrategy
from tables.import_export.serializers.configs import (
    LLMConfigSerializer,
    EmbeddingConfigSerializer,
    RealtimeConfigSerializer,
    RealtimeTranscriptionConfigSerializer,
)
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import ensure_unique_identifier, create_filters


class BaseConfigStrategy(EntityImportStrategy):

    entity_type: EntityType

    config_model = None
    model_class = None
    provider_field = None
    model_fk_field = None
    serializer_class = None

    def get_instance(self, entity_id: int):
        return self.config_model.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance):
        return {}

    def create_entity(self, data, id_mapper: IDMapper):
        if "custom_name" in data:
            existing_names = self.config_model.objects.values_list(
                "custom_name", flat=True
            )
            data["custom_name"] = ensure_unique_identifier(
                base_name=data["custom_name"],
                existing_names=existing_names,
            )

        serializer = self.serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def export_entity(self, instance) -> dict:
        return self.serializer_class(instance).data

    def find_existing(self, data, id_mapper):
        data_copy = deepcopy(data)

        data_copy.pop("id", None)
        model_name = data_copy.pop("model_name", None)
        provider_name = data_copy.pop("provider_name", None)

        filters, null_filters = create_filters(data_copy)

        existing = self.config_model.objects.filter(
            **filters,
            **null_filters,
            **{
                f"{self.model_fk_field}__{self.provider_field}__name": provider_name,
                f"{self.model_fk_field}__name": model_name,
            },
        ).first()

        return existing


class LLMConfigStrategy(BaseConfigStrategy):

    entity_type = EntityType.LLM_CONFIG
    config_model = LLMConfig
    model_class = LLMModel
    provider_field = "llm_provider"
    model_fk_field = "model"
    serializer_class = LLMConfigSerializer


class EmbeddingConfigStrategy(BaseConfigStrategy):

    entity_type = EntityType.EMBEDDING_CONFIG
    config_model = EmbeddingConfig
    model_class = EmbeddingModel
    provider_field = "embedding_provider"
    model_fk_field = "model"
    serializer_class = EmbeddingConfigSerializer


class RealtimeConfigStrategy(BaseConfigStrategy):

    entity_type = EntityType.REALTIME_CONFIG
    config_model = RealtimeConfig
    model_class = RealtimeModel
    provider_field = "provider"
    model_fk_field = "realtime_model"
    serializer_class = RealtimeConfigSerializer


class RealtimeTranscriptionConfigStrategy(BaseConfigStrategy):

    entity_type = EntityType.REALTIME_TRANSCRIPTION_CONFIG
    config_model = RealtimeTranscriptionConfig
    model_class = RealtimeTranscriptionModel
    provider_field = "provider"
    model_fk_field = "realtime_transcription_model"
    serializer_class = RealtimeTranscriptionConfigSerializer
