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


class TagHandlingMixin:
    """
    Mixin for handling model tags.
    Rules:
    1. Predefined tags MAY be present in the request.
    2. Users CANNOT remove an existing predefined tag (validation error).
    3. Users CANNOT manually add/assign a predefined tag that was not previously present (validation error).
    """

    tag_model = None

    def _resolve_tags(self, tags_data):
        resolved = []
        for tag in tags_data:
            if "id" in tag:
                try:
                    obj = self.tag_model.objects.get(id=tag["id"])
                except self.tag_model.DoesNotExist:
                    raise serializers.ValidationError(
                        f"Tag with id {tag['id']} not found."
                    )
            elif "name" in tag:
                obj, _ = self.tag_model.objects.get_or_create(
                    name=tag["name"],
                    defaults={"predefined": False},
                )
            else:
                continue

            resolved.append(obj)
        return resolved

    def _validate_predefined_tags_on_update(self, instance, resolved_tags):
        resolved_set = set(resolved_tags)
        existing_predefined = set(instance.tags.filter(predefined=True))

        missing_tags = existing_predefined - resolved_set
        if missing_tags:
            names = ", ".join([t.name for t in missing_tags])
            raise serializers.ValidationError(
                f"You cannot remove the following predefined tags: {names}. They must be present in the request."
            )

        incoming_predefined = {t for t in resolved_set if t.predefined}
        new_predefined = incoming_predefined - existing_predefined
        if new_predefined:
            names = ", ".join([t.name for t in new_predefined])
            raise serializers.ValidationError(
                f"You cannot manually assign predefined tags: {names}."
            )

    def _validate_predefined_tags_on_create(self, resolved_tags):
        for tag in resolved_tags:
            if tag.predefined:
                raise serializers.ValidationError(
                    f"You cannot manually assign predefined tag '{tag.name}' during creation."
                )
