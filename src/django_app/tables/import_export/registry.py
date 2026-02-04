from tables.import_export.strategies.base import EntityImportStrategy


class EntityRegistry:

    def __init__(self):
        self._strategies = {}

    def register(self, strategy: EntityImportStrategy):
        self._strategies[strategy.entity_type] = strategy

    def get_strategy(self, entity_type: str) -> EntityImportStrategy:
        return self._strategies[entity_type]


entity_registry = EntityRegistry()
