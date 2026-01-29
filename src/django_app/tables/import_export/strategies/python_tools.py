from copy import deepcopy

from tables.models import PythonCode, PythonCodeTool
from tables.import_export.strategies.base import EntityImportStrategy
from tables.import_export.serializers.python_tools import (
    PythonCodeSerializer,
    PythonCodeToolSerializer,
)
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import (
    ensure_unique_identifier,
    create_filters,
    python_code_equal,
)


class PythonCodeStrategy(EntityImportStrategy):

    entity_type = EntityType.PYTHON_CODE
    serializer_class = PythonCodeSerializer

    def get_instance(self, entity_id: int) -> PythonCode:
        return PythonCode.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance):
        return {}

    def export_entity(self, instance: PythonCode) -> dict:
        return self.serializer_class(instance).data

    def create_entity(self, data: dict, id_mapper: IDMapper) -> PythonCode:
        serializer = self.serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()


class PythonCodeToolStrategy(EntityImportStrategy):

    entity_type = EntityType.PYTHON_CODE_TOOL
    serializer_class = PythonCodeToolSerializer

    def get_instance(self, entity_id: int) -> PythonCode:
        return PythonCodeTool.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance) -> dict[str, list[int]]:
        return {EntityType.PYTHON_CODE: [instance.python_code.id]}

    def export_entity(self, instance: PythonCode) -> dict:
        return self.serializer_class(instance).data

    def create_entity(self, data: dict, id_mapper: IDMapper) -> PythonCode:
        old_python_code_id = data.get("python_code", None)

        if "name" in data:
            existing_names = PythonCodeTool.objects.values_list("name", flat=True)
            data["name"] = ensure_unique_identifier(
                base_name=data["name"],
                existing_names=existing_names,
            )

        serializer = self.serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        python_code_tool = serializer.save()

        new_python_code_id = id_mapper.get_or_none(
            EntityType.PYTHON_CODE, old_python_code_id
        )
        python_code_tool.python_code = PythonCode.objects.get(id=new_python_code_id)
        python_code_tool.save()

        return python_code_tool

    def find_existing(self, data, id_mapper):
        data_copy = deepcopy(data)
        data_copy.pop("id", None)

        old_python_code_id = data_copy.pop("python_code", None)
        new_python_code_id = id_mapper.get_or_none(
            EntityType.PYTHON_CODE, old_python_code_id
        )
        new_python_code = PythonCode.objects.get(id=new_python_code_id)

        filters, null_filters = create_filters(data_copy)
        existing_python_tool = PythonCodeTool.objects.filter(
            **filters, **null_filters
        ).first()

        if existing_python_tool and python_code_equal(
            existing_python_tool.python_code, new_python_code
        ):
            return existing_python_tool
        return None
