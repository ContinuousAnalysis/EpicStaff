from typing import List
from collections import defaultdict

from django.db import transaction

from tables.models import PythonCodeTool
from tables.import_export.id_mapper import IDMapper
from tables.import_export.registry import EntityRegistry
from tables.import_export.enums import EntityType


class ImportService:
    def __init__(self, registry: EntityRegistry):
        self.registry = registry

    def import_data(self, export_data: dict):
        id_mapper = IDMapper()
        created_entities = defaultdict(list)

        ordered_types = self._resolve_import_order(export_data)

        with transaction.atomic():
            for entity_type in ordered_types:
                entities = export_data.get(entity_type, [])
                strategy = self.registry.get_strategy(entity_type)

                for entity_data in entities:
                    old_id = entity_data["id"]
                    instance, was_created = strategy.import_entity(
                        entity_data, id_mapper
                    )

                    if was_created:
                        created_entities[entity_type].append(instance)

                    id_mapper.map(entity_type, old_id, instance.id)

            self._cleanup_orphaned_python_code(created_entities)

        return id_mapper

    def _resolve_import_order(self, export_data: dict) -> List[str]:
        """
        Topological sort based on dependencies.
        """
        dependency_order = [
            EntityType.LLM_CONFIG,
            EntityType.EMBEDDING_CONFIG,
            EntityType.REALTIME_CONFIG,
            EntityType.REALTIME_TRANSCRIPTION_CONFIG,
            EntityType.PYTHON_CODE,
            EntityType.PYTHON_CODE_TOOL,
            EntityType.MCP_TOOL,
            EntityType.AGENT,
            EntityType.CREW,
        ]

        sorted_keys = [
            entity_type
            for entity_type in dependency_order
            if entity_type in export_data
        ]

        return sorted_keys

    def _cleanup_orphaned_python_code(self, created_entities):
        """Delete PythonCode that was created but isn't actually needed"""
        # TODO: Better to move PythonCode inside of instance, cause there will never be 2 instances referencing PythonCode
        for python_code in created_entities.get(EntityType.PYTHON_CODE, []):
            if not PythonCodeTool.objects.filter(python_code=python_code).exists():
                python_code.delete()
