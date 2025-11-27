from tables.exceptions import PythonCodeToolConfigSerializerError
from tables.models.python_models import PythonCodeTool


class PythonCodeToolConfigValidator:
    def __init__(self, validate_null_fields=True, validate_missing_required_fields=True):
        self.validate_null_fields = validate_null_fields
        self.validate_missing_required_fields = validate_missing_required_fields

    def validate(self, name, tool: PythonCodeTool, configuration: dict):
        if not isinstance(configuration, dict):
            raise PythonCodeToolConfigSerializerError(f"Field configuration must be an object")
        fields = tool.get_tool_config_fields()
        validated = {}

        for field_name, field_obj in fields.items():
            value = configuration.get(field_name, field_obj.get_default_value())

            if value is None and field_obj.required and self.validate_missing_required_fields:
                raise PythonCodeToolConfigSerializerError(f"Field '{field_name}' is required")

            if value is not None:
                value = self._cast_value(value, field_obj.data_type)

            validated[field_name] = value

        return validated

    def _cast_value(self, value, data_type):
        from tables.models import PythonCodeToolConfigField as Field
        try:
            match data_type:
                case Field.FieldType.STRING:
                    return str(value)
                case Field.FieldType.BOOLEAN:
                    return bool(value)
                case Field.FieldType.INTEGER | Field.FieldType.LLM_CONFIG | Field.FieldType.EMBEDDING_CONFIG:
                    return int(value)
                case Field.FieldType.FLOAT:
                    return float(value)
                case Field.FieldType.ANY:
                    return value
                case _:
                    return value
        except ValueError as e:
            raise PythonCodeToolConfigSerializerError(f"Error casting value '{value}' into '{data_type}'")