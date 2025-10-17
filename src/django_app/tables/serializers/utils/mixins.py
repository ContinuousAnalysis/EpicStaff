from rest_framework import serializers
from tables.models import Agent, PythonCodeTool, ToolConfig, McpTool


class NestedAgentExportMixin:
    """
    A mixin that defines methods for exporting `Agent` fields data when
    agent is being used as part of another entity in serializer.

    Feilds that can be defined in a child class:
        `tools`: dictionary where `key` is tools name and `value` is list of tool IDs
        `llm_config`: integer field
        `fcm_llm_config`: integer field
        `realtime_agent`: integer field

    Methods:
        `get_tools`: returns lists of IDs for each tool type that agent has in database
        `get_llm_config`: returns an ID of agent's LLMConfig
        `get_fcm_llm_config`: returns an ID of agent's FCM LLMConfig
        `get_realtime_agent`: returns an ID of realtime agent that is related to agent
    """

    def get_tools(self, agent):
        return {
            "python_tools": list(
                PythonCodeTool.objects.filter(
                    agentpythoncodetools__agent_id=agent.pk
                ).values_list("id", flat=True)
            ),
            "configured_tools": list(
                ToolConfig.objects.filter(
                    agentconfiguredtools__agent_id=agent.pk
                ).values_list("id", flat=True)
            ),
            "mcp_tools": list(
                McpTool.objects.filter(agentmcptools__agent_id=agent.pk).values_list(
                    "id", flat=True
                )
            ),
        }

    def get_llm_config(self, agent: Agent):
        if agent.llm_config:
            return agent.llm_config.id

    def get_fcm_llm_config(self, agent: Agent):
        if agent.fcm_llm_config:
            return agent.fcm_llm_config.id

    def get_realtime_agent(self, agent: Agent):
        if agent.realtime_agent:
            return agent.realtime_agent.pk


class NestedCrewExportMixin:
    """
    A mixin that defines methods for exporting `Crew` fields data when
    crew is being used as part of another entity in serializer.

    Feilds that can be defined in a child class:
        `agents`: a list of integers

    Methods:
        `get_ageants`: returns a list of agent IDs for this crew
    """

    def get_agents(self, crew):
        agents = list(crew.agents.all().values_list("id", flat=True))
        return agents


class HashedFieldSerializerMixin:
    """
    Mixin to handle hashed field operations in serializers.

    Configuration:
    - HASHED_FIELD_NAME: Name of the hashed field (default: "secret_key")
    - REQUIRE_IDENTIFIER_FOR_UPDATE: If True, requires secret_key verification for updates/deletes
    - REQUIRE_OLD_FOR_CHANGE: If True, requires old secret_key when changing to new one
    - IDENTIFIER_FIELD: Field name to require for verification during updates (e.g., "name", "username")
    """

    HASHED_FIELD_NAME = "secret_key"
    REQUIRE_IDENTIFIER_FOR_UPDATE = False
    REQUIRE_OLD_FOR_CHANGE = False
    IDENTIFIER_FIELD = None

    def get_hashed_field_name(self):
        return getattr(self, "HASHED_FIELD_NAME", "secret_key")

    def create(self, validated_data):
        field_name = self.get_hashed_field_name()
        raw_value = validated_data.pop(field_name, None)
        validated_data.pop(f"old_{field_name}", None)

        instance = self.Meta.model(**validated_data)
        if raw_value:
            setter = getattr(instance, f"set_{field_name}", None)
            if setter:
                setter(raw_value)
            else:
                instance.set_hashed_field(raw_value, field_name)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        field_name = self.get_hashed_field_name()
        new_value = validated_data.pop(field_name, None)
        old_value = validated_data.pop(f"old_{field_name}", None)

        if self.REQUIRE_IDENTIFIER_FOR_UPDATE:
            if new_value is None:
                raise serializers.ValidationError(
                    {
                        field_name: f"You must provide {field_name} to update this object."
                    }
                )
            checker = getattr(instance, f"check_{field_name}", None)
            is_valid = (
                checker(new_value)
                if checker
                else instance.check_hashed_field(new_value, field_name)
            )
            if not is_valid:
                raise serializers.ValidationError(
                    {field_name: f"The provided {field_name} is incorrect."}
                )
            new_value = None

        elif new_value is not None:
            if self.REQUIRE_OLD_FOR_CHANGE and old_value is None:
                raise serializers.ValidationError(
                    {
                        f"old_{field_name}": f"Must provide old_{field_name} to change {field_name}"
                    }
                )
            if self.REQUIRE_OLD_FOR_CHANGE:
                checker = getattr(instance, f"check_{field_name}", None)
                is_valid = (
                    checker(old_value)
                    if checker
                    else instance.check_hashed_field(old_value, field_name)
                )
                if not is_valid:
                    raise serializers.ValidationError(
                        {f"old_{field_name}": f"The old {field_name} is incorrect"}
                    )
            setter = getattr(instance, f"set_{field_name}", None)
            if setter:
                setter(new_value)
            else:
                instance.set_hashed_field(new_value, field_name)

        return super().update(instance, validated_data)
