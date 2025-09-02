from rest_framework import serializers

from tables.models import (
    Agent,
    LLMConfig,
    PythonCodeTool,
    ToolConfig,
    PythonCode,
    Crew,
    Task,
    EmbeddingConfig,
)
from tables.serializers.model_serializers import (
    RealtimeAgentSerializer,
    GraphSerializer,
    CrewNodeSerializer,
    PythonNodeSerializer,
    ConditionalEdgeSerializer,
)


class PythonCodeExportSerializer(serializers.ModelSerializer):

    class Meta:
        model = PythonCode
        fields = "__all__"


class PythonCodeToolExportSerializer(serializers.ModelSerializer):

    python_code = PythonCodeExportSerializer()

    class Meta:
        model = PythonCodeTool
        exclude = ["favorite"]


class ToolConfigExportSerilizer(serializers.ModelSerializer):

    tool = serializers.SerializerMethodField()

    class Meta:
        model = ToolConfig
        fields = "__all__"

    def get_tool(self, instance):
        return instance.tool.name_alias


class GeneralToolExportSerializer(serializers.Serializer):

    data = serializers.DictField(required=True)

    def to_representation(self, instance):
        tool_classes = (
            (PythonCodeTool, PythonCodeToolExportSerializer),
            (ToolConfig, ToolConfigExportSerilizer),
        )
        tool = {}

        for tool_class, tool_serializer in tool_classes:
            if isinstance(instance, tool_class):
                tool = tool_serializer(instance).data

        if not tool:
            raise TypeError(
                f"Unsupported tool type for serialization: {type(instance)}"
            )

        return tool


class EmbeddingConfigExportSerializer(serializers.ModelSerializer):

    model = serializers.SerializerMethodField()

    class Meta:
        model = EmbeddingConfig
        exclude = ["api_key"]

    def get_model(self, config_instance):
        return config_instance.model.name


class LLMConfigExportSerializer(serializers.ModelSerializer):

    model = serializers.SerializerMethodField()

    class Meta:
        model = LLMConfig
        exclude = ["api_key"]

    def get_model(self, config_instance):
        return config_instance.model.name


class AgentExportSerializer(serializers.ModelSerializer):

    tools = serializers.SerializerMethodField()
    llm_config = LLMConfigExportSerializer()
    fcm_llm_config = LLMConfigExportSerializer()
    realtime_agent = RealtimeAgentSerializer(read_only=True)

    class Meta:
        model = Agent
        exclude = [
            "knowledge_collection",
            "python_code_tools",
            "configured_tools",
        ]

    def get_tools(self, agent: Agent) -> list[dict]:
        return {
            "python_tools": GeneralToolExportSerializer(
                instance=agent.python_code_tools.all(), many=True
            ).data,
            "configured_tools": GeneralToolExportSerializer(
                instance=agent.configured_tools.all(), many=True
            ).data,
        }


class NestedAgentExportSerializer(AgentExportSerializer):

    llm_config = serializers.SerializerMethodField()
    fcm_llm_config = serializers.SerializerMethodField()

    def get_tools(self, agent):
        return {
            "python_tools": list(
                agent.python_code_tools.all().values_list("id", flat=True)
            ),
            "configured_tools": list(
                agent.configured_tools.all().values_list("id", flat=True)
            ),
        }

    def get_llm_config(self, agent: Agent):
        if agent.llm_config:
            return agent.llm_config.id

    def get_fcm_llm_config(self, agent: Agent):
        if agent.fcm_llm_config:
            return agent.fcm_llm_config.id


class TaskExportSerializer(serializers.ModelSerializer):

    tools = serializers.SerializerMethodField()

    class Meta:
        model = Task
        exclude = ["crew"]

    def get_tools(self, task: Task) -> list[dict]:
        return {
            "python_tools": list(
                task.task_python_code_tool_list.all().values_list("tool_id", flat=True)
            ),
            "configured_tools": list(
                task.task_configured_tool_list.all().values_list("tool_id", flat=True)
            ),
        }


class CrewExportSerializer(serializers.ModelSerializer):

    agents = serializers.SerializerMethodField()
    tasks = serializers.SerializerMethodField()
    tools = serializers.SerializerMethodField()

    embedding_config = EmbeddingConfigExportSerializer(required=False, allow_null=True)

    memory_llm_config = serializers.SerializerMethodField()
    manager_llm_config = serializers.SerializerMethodField()
    planning_llm_config = serializers.SerializerMethodField()

    llm_configs = serializers.SerializerMethodField()

    class Meta:
        model = Crew
        exclude = ["id", "tags", "knowledge_collection"]

    def get_tasks(self, crew: Crew):
        tasks = crew.task_set.all()
        return TaskExportSerializer(tasks, many=True).data

    def get_agents(self, crew: Crew):
        agents = crew.get_agents()
        return NestedAgentExportSerializer(agents, many=True).data

    def get_tools(self, crew: Crew):
        agent_configured_tools = ToolConfig.objects.filter(agent__crew=crew).distinct()
        agent_python_tools = PythonCodeTool.objects.filter(agent__crew=crew).distinct()
        task_configured_tools = ToolConfig.objects.filter(
            taskconfiguredtools__task__crew=crew
        ).distinct()
        task_python_tools = PythonCodeTool.objects.filter(
            taskpythoncodetools__task__crew=crew
        ).distinct()

        all_configured_tools = agent_configured_tools.union(task_configured_tools)
        all_python_tools = agent_python_tools.union(task_python_tools)

        return {
            "configured_tools": GeneralToolExportSerializer(
                instance=all_configured_tools, many=True
            ).data,
            "python_tools": list(
                GeneralToolExportSerializer(instance=all_python_tools, many=True).data
            ),
        }

    def get_memory_llm_config(self, crew: Crew):
        if crew.memory_llm_config:
            return crew.memory_llm_config.id

    def get_manager_llm_config(self, crew: Crew):
        if crew.manager_llm_config:
            return crew.manager_llm_config.id

    def get_planning_llm_config(self, crew: Crew):
        if crew.planning_llm_config:
            return crew.planning_llm_config.id

    def get_llm_configs(self, crew: Crew):

        config_ids = (
            crew.agents.exclude(llm_config__isnull=True, fcm_llm_config__isnull=True)
            .values_list("llm_config", "fcm_llm_config")
            .distinct()
        )

        unique_ids = set()

        if crew.memory_llm_config:
            unique_ids.add(crew.memory_llm_config.id)
        if crew.manager_llm_config:
            unique_ids.add(crew.manager_llm_config.id)
        if crew.planning_llm_config:
            unique_ids.add(crew.planning_llm_config.id)

        for llm_id, fcm_id in config_ids:
            if llm_id:
                unique_ids.add(llm_id)
            if fcm_id:
                unique_ids.add(fcm_id)

        llm_configs = LLMConfig.objects.filter(id__in=unique_ids)
        serializer = LLMConfigExportSerializer(instance=llm_configs, many=True)
        return serializer.data


class NestedCrewExportSerializer(CrewExportSerializer):

    tools = None
    llm_configs = None

    class Meta(CrewExportSerializer.Meta):
        exclude = ["tags", "knowledge_collection"]

    def get_agents(self, crew):
        agents = list(crew.agents.all().values_list("id", flat=True))
        return agents


class CrewNodeExportSerializer(CrewNodeSerializer):

    crew_id = serializers.IntegerField(read_only=True)

    class Meta(CrewNodeSerializer.Meta):
        fields = ["crew_id", "node_name", "input_map", "output_variable_path"]
        read_only_fields = []


class PythonNodeExportSerializer(PythonNodeSerializer):

    python_code = PythonCodeExportSerializer()


class ConditionalEdgeExportSerializer(ConditionalEdgeSerializer):

    python_code = PythonCodeExportSerializer()


class GraphExportSerializer(GraphSerializer):

    crew_node_list = CrewNodeExportSerializer(many=True)
    python_node_list = PythonNodeExportSerializer(many=True)
    conditional_edge_list = ConditionalEdgeExportSerializer(many=True)
    crews = serializers.SerializerMethodField()
    agents = serializers.SerializerMethodField()
    tools = serializers.SerializerMethodField()
    llm_configs = serializers.SerializerMethodField()

    class Meta(GraphSerializer.Meta):
        fields = "__all__"

    def get_crews(self, graph):
        unique_crews = (
            graph.crew_node_list.order_by("crew")
            .distinct("crew")
            .values_list("crew", flat=True)
        )
        crews = Crew.objects.filter(id__in=unique_crews)
        serializer = NestedCrewExportSerializer(instance=crews, many=True)
        return serializer.data

    def get_agents(self, graph):
        agents = Agent.objects.filter(crew__crewnode__graph=graph).distinct()
        serializer = NestedAgentExportSerializer(instance=agents, many=True)
        return serializer.data

    def get_tools(self, graph):
        agent_configured_tools = ToolConfig.objects.filter(
            agent__crew__crewnode__graph=graph
        ).distinct()
        agent_python_tools = PythonCodeTool.objects.filter(
            agent__crew__crewnode__graph=graph
        ).distinct()
        task_configured_tools = ToolConfig.objects.filter(
            taskconfiguredtools__task__crew__crewnode__graph=graph
        ).distinct()
        task_python_tools = PythonCodeTool.objects.filter(
            taskpythoncodetools__task__crew__crewnode__graph=graph
        ).distinct()

        all_configured_tools = agent_configured_tools.union(task_configured_tools)
        all_python_tools = agent_python_tools.union(task_python_tools)

        return {
            "configured_tools": GeneralToolExportSerializer(
                instance=all_configured_tools, many=True
            ).data,
            "python_tools": list(
                GeneralToolExportSerializer(instance=all_python_tools, many=True).data
            ),
        }

    def get_llm_configs(self, graph):
        unique_ids = set()

        crew_ids = Crew.objects.filter(crewnode__graph=graph).values_list(
            "memory_llm_config", "manager_llm_config", "planning_llm_config"
        )
        for memory_id, manager_id, planning_id in crew_ids:
            if memory_id:
                unique_ids.add(memory_id)
            if manager_id:
                unique_ids.add(manager_id)
            if planning_id:
                unique_ids.add(planning_id)

        agent_config_ids = (
            Agent.objects.filter(crew__crewnode__graph=graph)
            .exclude(llm_config__isnull=True, fcm_llm_config__isnull=True)
            .values_list("llm_config", "fcm_llm_config")
            .distinct()
        )
        for llm_id, fcm_id in agent_config_ids:
            if llm_id:
                unique_ids.add(llm_id)
            if fcm_id:
                unique_ids.add(fcm_id)

        llm_configs = LLMConfig.objects.filter(id__in=unique_ids)
        serializer = LLMConfigExportSerializer(instance=llm_configs, many=True)
        return serializer.data
