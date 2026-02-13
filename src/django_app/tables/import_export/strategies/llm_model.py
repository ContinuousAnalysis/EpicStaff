from copy import deepcopy

from tables.models import LLMModel, Provider

from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.llm_model import LLMModelImportSerializer
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import ensure_unique_identifier, create_filters


class LLMModelStrategy(EntityImportExportStrategy):
    entity_type = EntityType.LLM_MODEL
    serializer_class = LLMModelImportSerializer

    def get_instance(self, entity_id: int):
        return LLMModel.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance):
        return {}

    def create_entity(self, data, id_mapper: IDMapper):
        if "name" in data:
            existing_names = LLMModel.objects.values_list("name", flat=True)
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

        existing = LLMModel.objects.filter(
            **filters,
            **null_filters,
            **{
                "llm_provider__name": provider_name,
            },
        ).first()

        return existing
