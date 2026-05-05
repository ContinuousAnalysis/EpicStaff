from rest_framework import serializers

from django_app.tables.exceptions import (
    BuiltInToolModificationError,
    PythonCodeToolConfigSerializerError,
)
from django_app.tables.models.graph_models import PythonNode
from django_app.tables.models.python_models import (
    PythonCode,
    PythonCodeResult,
    PythonCodeTool,
    PythonCodeToolConfig,
    PythonCodeToolConfigField,
)
from django_app.tables.serializers.base_serializer import ContentHashWritableMixin
from django_app.tables.serializers.model_serializers import PythonCodeSerializer
from django_app.tables.validators.python_code_tool_config_validator import (
    PythonCodeToolConfigValidator,
)


class PythonNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta:
        model = PythonNode
        fields = "__all__"

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        pytohn_node = PythonNode.objects.create(
            python_code=python_code, **validated_data
        )
        return pytohn_node

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)

        # Update nested PythonCode instance if provided
        if python_code_data:
            python_code = instance.python_code
            expected_hash = python_code_data.pop("content_hash", None)
            if expected_hash is not None:
                python_code._expected_hash = expected_hash
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        # Update PythonNode fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
        # Delegate to the update method for consistency
        return self.update(instance, validated_data)


class PythonCodeToolConfigFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = PythonCodeToolConfigField
        fields = [
            "id",
            "name",
            "tool",
            "description",
            "data_type",
            "required",
            "secret",
        ]


class PythonCodeToolSerializer(serializers.ModelSerializer):
    python_code = PythonCodeSerializer()
    tool_fields = PythonCodeToolConfigFieldSerializer(many=True, read_only=True)
    built_in = serializers.ReadOnlyField()

    class Meta:
        model = PythonCodeTool
        fields = [
            "id",
            "name",
            "description",
            "args_schema",
            "python_code",
            "favorite",
            "built_in",
            "tool_fields",
        ]
        read_only_fields = ["id", "built_in", "tool_fields"]

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        python_code_tool = PythonCodeTool.objects.create(
            python_code=python_code, **validated_data
        )
        return python_code_tool

    def update(self, instance, validated_data):
        if instance.built_in:
            raise BuiltInToolModificationError()

        python_code_data = validated_data.pop("python_code", None)

        if python_code_data:
            python_code = instance.python_code
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        for attr, value in validated_data.items():
            if attr != "built_in":
                setattr(instance, attr, value)
        instance.save()

        return instance


class PythonCodeToolConfigSerializer(serializers.ModelSerializer):
    def __init__(self, *args, tool_config_validator=None, **kwargs):
        super().__init__(*args, **kwargs)

        self.tool_config_validator = (
            tool_config_validator
            or PythonCodeToolConfigValidator(
                validate_null_fields=True,
                validate_missing_required_fields=True,
            )
        )

    class Meta:
        model = PythonCodeToolConfig
        fields = "__all__"

    def validate(self, data: dict):
        name = data.get("name")
        tool = data.get("tool")
        configuration = data.get("configuration", dict())

        if name is None:
            raise PythonCodeToolConfigSerializerError(
                "Name for configuration is not provided."
            )
        if tool is None:
            raise PythonCodeToolConfigSerializerError("Tool is not provided.")
        if configuration is None:
            raise PythonCodeToolConfigSerializerError("Configuration is not provided.")

        try:
            validated_configuration = self.tool_config_validator.validate(
                name=name,
                tool=tool,
                configuration=configuration,
            )
            data["configuration"] = validated_configuration
        except serializers.ValidationError as e:
            raise PythonCodeToolConfigSerializerError(e.message)

        return data


class PythonCodeResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = PythonCodeResult
        fields = "__all__"
