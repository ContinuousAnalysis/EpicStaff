from rest_framework import serializers
from tables.models.mcp_models import McpTool
from tables.models.crew_models import ToolConfig
from tables.models.python_models import PythonCodeTool
from tables.models.realtime_models import VoiceChoices


class RunSessionSerializer(serializers.Serializer):
    graph_id = serializers.IntegerField(required=True)
    organization_data = serializers.JSONField(required=False)
    organization_user_data = serializers.JSONField(required=False)
    variables = serializers.JSONField(required=False)
    files = serializers.DictField(
        child=serializers.CharField(), required=False, allow_null=True, default=dict
    )

    def validate(self, attrs):
        errors = {}

        org_data = attrs.get("organization_data")
        user_data = attrs.get("organization_user_data")

        if org_data is not None:
            if not isinstance(org_data, dict):
                errors["organization_data"] = "Must be a JSON object."
            else:
                missing = [key for key in ("name", "secret_key") if key not in org_data]
                if missing:
                    errors["organization_data"] = (
                        f"Missing required fields: {', '.join(missing)}."
                    )

        if user_data is not None:
            if not isinstance(user_data, dict):
                errors["organization_user_data"] = "Must be a JSON object."
            else:
                missing = [
                    key for key in ("username", "secret_key") if key not in user_data
                ]
                if missing:
                    errors["organization_user_data"] = (
                        f"Missing required fields: {', '.join(missing)}."
                    )

        if errors:
            raise serializers.ValidationError(errors)

        return attrs


class GetUpdatesSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=True)


class AnswerToLLMSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=True)
    crew_id = serializers.IntegerField(required=True)
    execution_order = serializers.IntegerField(required=True)
    name = serializers.CharField()
    answer = serializers.CharField()


class EnvironmentConfigSerializer(serializers.Serializer):
    data = serializers.DictField(required=True)


class InitRealtimeSerializer(serializers.Serializer):
    agent_id = serializers.IntegerField(required=True)


class BaseToolSerializer(serializers.Serializer):

    unique_name = serializers.CharField(required=True)  # type + id
    data = serializers.DictField(required=True)

    def to_representation(self, instance):  # instance is a Tool instance
        from tables.serializers.model_serializers import (
            PythonCodeToolSerializer,
            McpToolSerializer,
            ToolConfigSerializer,
        )

        repr = {}
        if isinstance(instance, PythonCodeTool):
            repr["unique_name"] = f"python-code-tool:{instance.pk}"
            repr["data"] = PythonCodeToolSerializer(instance).data
        elif isinstance(instance, ToolConfig):
            repr["unique_name"] = f"configured-tool:{instance.pk}"
            repr["data"] = ToolConfigSerializer(instance).data
        elif isinstance(instance, McpTool):
            repr["unique_name"] = f"mcp-tool:{instance.pk}"
            repr["data"] = McpToolSerializer(instance).data
        else:
            raise TypeError(
                f"Unsupported tool type for serialization: {type(instance)}"
            )

        return repr
