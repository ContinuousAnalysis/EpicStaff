from tables.models import (
    Crew,
    Agent,
    TaskContext,
    TaskPythonCodeTools,
    TaskMcpTools,
    LLMConfig,
    EmbeddingConfig,
)
from tables.import_export.strategies.base import EntityImportStrategy
from tables.import_export.serializers.crew import CrewSerializer, TaskSerializer
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper


class CrewStrategy(EntityImportStrategy):

    entity_type = EntityType.CREW
    serializer_class = CrewSerializer

    def get_instance(self, entity_id: int):
        return Crew.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance):
        deps = {}
        deps[EntityType.AGENT] = list(instance.agents.values_list("id", flat=True))

        llm_config_ids = set()
        if instance.memory_llm_config:
            llm_config_ids.add(instance.memory_llm_config.id)
        if instance.manager_llm_config:
            llm_config_ids.add(instance.manager_llm_config.id)
        if instance.planning_llm_config:
            llm_config_ids.add(instance.planning_llm_config.id)

        deps[EntityType.LLM_CONFIG] = list(llm_config_ids)

        if instance.embedding_config:
            deps[EntityType.EMBEDDING_CONFIG] = [instance.embedding_config.id]

        tasks = instance.task_set.all()
        deps[EntityType.PYTHON_CODE_TOOL] = list(
            TaskPythonCodeTools.objects.filter(task__in=tasks)
            .values_list("tool_id", flat=True)
            .distinct()
        )
        deps[EntityType.MCP_TOOL] = list(
            TaskMcpTools.objects.filter(task__in=tasks)
            .values_list("tool_id", flat=True)
            .distinct()
        )

        return deps

    def export_entity(self, instance: Crew) -> dict:
        return self.serializer_class(instance).data

    def create_entity(self, data: dict, id_mapper: IDMapper) -> Crew:
        tasks = data.pop("tasks", [])
        agents = data.pop("agents", [])

        memory_llm_config_id = data.pop("memory_llm_config", None)
        manager_llm_config_id = data.pop("manager_llm_config", None)
        planning_llm_config_id = data.pop("planning_llm_config", None)
        embedding_config_id = data.pop("embedding_config", None)

        serializer = self.serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        crew = serializer.save()

        if memory_llm_config_id:
            crew.memory_llm_config = self._get_llm_config(
                memory_llm_config_id, id_mapper
            )
        if manager_llm_config_id:
            crew.manager_llm_config = self._get_llm_config(
                manager_llm_config_id, id_mapper
            )
        if planning_llm_config_id:
            crew.planning_llm_config_id = self._get_llm_config(
                planning_llm_config_id, id_mapper
            )
        if embedding_config_id:
            new_id = id_mapper.get_or_none(
                EntityType.EMBEDDING_CONFIG, embedding_config_id
            )
            crew.embedding_config = EmbeddingConfig.objects.filter(id=new_id).first()

        self._assign_agents_to_crew(crew, agents, id_mapper)
        self._create_tasks_for_crew(tasks, crew, id_mapper)
        crew.save()

        return crew

    def _assign_agents_to_crew(self, crew, agent_ids, id_mapper: IDMapper):
        agents = []
        for agent_id in agent_ids:
            new_id = id_mapper.get_or_none(EntityType.AGENT, agent_id)
            agents.append(new_id)

        crew.agents.set(agents)

    def _create_tasks_for_crew(self, tasks_data, crew, id_mapper: IDMapper):
        created_tasks = {}
        task_contexts = {}

        for t_data in tasks_data:
            tools = t_data.pop("tools", {})
            context = t_data.pop("context", [])
            agent = t_data.pop("agent", None)
            old_id = t_data.pop("id", None)

            serializer = TaskSerializer(data=t_data)
            serializer.is_valid(raise_exception=True)
            task = serializer.save()

            self._assign_agent_to_task(agent, task, id_mapper)
            self._assign_tools_to_task(tools, task, id_mapper)
            task.crew = crew
            task.save()

            created_tasks[old_id] = task
            task_contexts[old_id] = context

        self._set_context_for_tasks(created_tasks, task_contexts)

    def _get_llm_config(self, config_id, id_mapper: IDMapper) -> LLMConfig | None:
        new_id = id_mapper.get_or_none(EntityType.LLM_CONFIG, config_id)
        return LLMConfig.objects.filter(id=new_id).first()

    def _assign_agent_to_task(self, agent_id, task, id_mapper: IDMapper):
        new_id = id_mapper.get_or_none(EntityType.AGENT, agent_id)
        task.agent = Agent.objects.filter(id=new_id).first()
        task.save()

    def _assign_tools_to_task(self, tools_data, task, id_mapper: IDMapper):
        python_tool_ids = tools_data.get(EntityType.PYTHON_CODE_TOOL, [])
        mcp_tool_ids = tools_data.get(EntityType.MCP_TOOL, [])

        python_tools = []
        mcp_tools = []

        for tool_id in python_tool_ids:
            new_id = id_mapper.get_or_none(EntityType.PYTHON_CODE_TOOL, tool_id)
            python_tools.append(new_id)
        for tool_id in mcp_tool_ids:
            new_id = id_mapper.get_or_none(EntityType.MCP_TOOL, tool_id)
            mcp_tools.append(new_id)

        task.task_python_code_tool_list.set(python_tools)
        task.task_mcp_tool_list.set(mcp_tools)

    def _set_context_for_tasks(self, created_tasks, task_contexts):
        task_context_links = []

        for old_id, new_task in created_tasks.items():
            context = task_contexts.get(old_id, [])

            for old_context in context:
                new_context = created_tasks.get(old_context)
                if not new_context:
                    continue

                task_context_links.append(
                    TaskContext(
                        task=new_task,
                        context=new_context,
                    )
                )

        TaskContext.objects.bulk_create(task_context_links, ignore_conflicts=True)
