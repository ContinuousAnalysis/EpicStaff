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
from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.configs import (
    LLMConfigImportSerializer,
    EmbeddingConfigImportSerializer,
    RealtimeConfigImportSerializer,
    RealtimeTranscriptionConfigImportSerializer,
)
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import ensure_unique_identifier, create_filters


class BaseConfigStrategy(EntityImportExportStrategy):
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


class LLMConfigStrategy(EntityImportExportStrategy):
    entity_type = EntityType.LLM_CONFIG
    serializer_class = LLMConfigImportSerializer

    def get_instance(self, entity_id: int):
        return LLMConfig.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance: LLMConfig):
        deps = {}
        deps[EntityType.LLM_MODEL] = [instance.model.id]
        return deps

    def create_entity(self, data, id_mapper: IDMapper):
        if "custom_name" in data:
            existing_names = LLMConfig.objects.values_list("custom_name", flat=True)
            data["custom_name"] = ensure_unique_identifier(
                base_name=data["custom_name"],
                existing_names=existing_names,
            )

        old_model_id = data.pop("model", None)
        model_id = id_mapper.get_or_none(EntityType.LLM_MODEL, old_model_id)

        serializer = self.serializer_class(data={**data, "model_id": model_id})
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def export_entity(self, instance) -> dict:
        return self.serializer_class(instance).data

    def find_existing(self, data, id_mapper):
        data_copy = deepcopy(data)

        data_copy.pop("id", None)
        old_model_id = data_copy.pop("model", None)
        new_model_id = id_mapper.get_or_none(EntityType.LLM_MODEL, old_model_id)

        model = LLMModel.objects.get(id=new_model_id)

        filters, null_filters = create_filters(data_copy)

        existing = LLMConfig.objects.filter(
            **filters,
            **null_filters,
            **{
                "model__llm_provider__name": model.llm_provider.name,
                "model__name": model.name,
            },
        ).first()

        return existing


class EmbeddingConfigStrategy(BaseConfigStrategy):
    entity_type = EntityType.EMBEDDING_CONFIG
    config_model = EmbeddingConfig
    model_class = EmbeddingModel
    provider_field = "embedding_provider"
    model_fk_field = "model"
    serializer_class = EmbeddingConfigImportSerializer


class RealtimeConfigStrategy(BaseConfigStrategy):
    entity_type = EntityType.REALTIME_CONFIG
    config_model = RealtimeConfig
    model_class = RealtimeModel
    provider_field = "provider"
    model_fk_field = "realtime_model"
    serializer_class = RealtimeConfigImportSerializer


class RealtimeTranscriptionConfigStrategy(BaseConfigStrategy):
    entity_type = EntityType.REALTIME_TRANSCRIPTION_CONFIG
    config_model = RealtimeTranscriptionConfig
    model_class = RealtimeTranscriptionModel
    provider_field = "provider"
    model_fk_field = "realtime_transcription_model"
    serializer_class = RealtimeTranscriptionConfigImportSerializer
