from typing import List

from django.db import transaction

from tables.import_export.id_mapper import IDMapper
from tables.import_export.registry import EntityRegistry
from tables.import_export.enums import EntityType


class ImportService:
    def __init__(self, registry: EntityRegistry):
        self.registry = registry

    def import_data(self, export_data: dict, main_entity: str):
        id_mapper = IDMapper()

        ordered_types = self._resolve_import_order(export_data)

        with transaction.atomic():
            for entity_type in ordered_types:
                entities = export_data.get(entity_type, [])
                strategy = self.registry.get_strategy(entity_type)

                for entity_data in entities:
                    old_id = entity_data["id"]
                    instance = strategy.import_entity(
                        entity_data, id_mapper, entity_type == main_entity
                    )

                    id_mapper.map(entity_type, old_id, instance.id)

        return id_mapper

    def _resolve_import_order(self, export_data: dict) -> List[str]:
        """
        Topological sort based on dependencies.
        """
        # Entities will be imported from top to bottom based on this list
        dependency_order = [
            EntityType.LLM_CONFIG,
            EntityType.EMBEDDING_CONFIG,
            EntityType.REALTIME_CONFIG,
            EntityType.REALTIME_TRANSCRIPTION_CONFIG,
            EntityType.PYTHON_CODE_TOOL,
            EntityType.MCP_TOOL,
            EntityType.AGENT,
            EntityType.CREW,
            EntityType.WEBHOOK_TRIGGER,
            EntityType.GRAPH,
        ]

        sorted_keys = [
            entity_type
            for entity_type in dependency_order
            if entity_type in export_data
        ]

        return sorted_keys
