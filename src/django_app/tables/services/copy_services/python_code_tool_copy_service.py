from tables.import_export.utils import ensure_unique_identifier
from tables.models.python_models import PythonCodeTool, PythonCodeToolConfigField
from tables.services.copy_services.helpers import copy_python_code


class PythonCodeToolCopyService:
    def copy(self, tool: PythonCodeTool, name: str | None = None) -> PythonCodeTool:
        new_code = copy_python_code(tool.python_code)

        existing_names = PythonCodeTool.objects.values_list("name", flat=True)
        new_name = ensure_unique_identifier(
            base_name=name if name else tool.name,
            existing_names=existing_names,
        )

        new_tool = PythonCodeTool.objects.create(
            name=new_name,
            description=tool.description,
            args_schema=tool.args_schema,
            python_code=new_code,
            favorite=tool.favorite,
            built_in=tool.built_in,
        )

        for field in tool.tool_fields.all():
            PythonCodeToolConfigField.objects.create(
                tool=new_tool,
                name=field.name,
                description=field.description,
                data_type=field.data_type,
                required=field.required,
                secret=field.secret,
            )

        return new_tool
