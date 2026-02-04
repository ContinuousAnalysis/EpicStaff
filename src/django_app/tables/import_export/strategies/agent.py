from copy import deepcopy

from tables.models import (
    Agent,
    RealtimeAgent,
    RealtimeConfig,
    RealtimeTranscriptionConfig,
    LLMConfig,
    AgentPythonCodeTools,
    AgentMcpTools,
)
from tables.models.knowledge_models.naive_rag_models import NaiveRagSearchConfig
from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.agent import AgentImportSerializer
from tables.import_export.serializers.rag_configs import (
    NaiveRagSearchConfigImportSerializer,
)
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper
from tables.import_export.utils import create_filters


class AgentStrategy(EntityImportExportStrategy):
    entity_type = EntityType.AGENT
    serializer_class = AgentImportSerializer

    def get_instance(self, entity_id: int):
        return Agent.objects.filter(id=entity_id).first()

    def extract_dependencies_from_instance(self, instance: Agent):
        deps = {}

        llm_configs = set()
        if instance.llm_config:
            llm_configs.add(instance.llm_config.id)
        if instance.fcm_llm_config:
            llm_configs.add(instance.fcm_llm_config.id)

        deps[EntityType.LLM_CONFIG] = llm_configs
        deps[EntityType.PYTHON_CODE_TOOL] = instance.python_code_tools.values_list(
            "pythoncodetool_id", flat=True
        )
        deps[EntityType.MCP_TOOL] = instance.mcp_tools.values_list(
            "mcptool_id", flat=True
        )

        realtime_config = instance.realtime_agent.realtime_config
        realtime_transcription_config = (
            instance.realtime_agent.realtime_transcription_config
        )

        if realtime_config:
            deps[EntityType.REALTIME_CONFIG] = realtime_config.id
        if realtime_transcription_config:
            deps[EntityType.REALTIME_TRANSCRIPTION_CONFIG] = (
                realtime_transcription_config.id
            )

        return deps

    def export_entity(self, instance: Agent) -> dict:
        return self.serializer_class(instance).data

    def create_entity(self, data: dict, id_mapper: IDMapper) -> Agent:
        llm_config, fcm_llm_config = self._get_llm_configs(data, id_mapper)
        python_tools, mcp_tools = self._get_tools(data, id_mapper)
        realtime_data = data.pop("realtime_agent", None)
        naive_search_config_data = data.pop("naive_search_config", None)

        agent = self._create_agent(data)
        self._assign_tools(agent, python_tools, mcp_tools)
        self._create_realtime_agent(agent, realtime_data, id_mapper)
        self._create_naive_search_config(agent, naive_search_config_data)

        agent.llm_config = llm_config
        agent.fcm_llm_config = fcm_llm_config
        agent.save()

        return agent

    def find_existing(self, data: dict, id_mapper: IDMapper) -> Agent:
        # TODO: It's too annoying to check objects deeper, maybe we need to save and compare object hashes for this
        data_copy = deepcopy(data)
        data_copy.pop("id", None)

        llm_config_id = data_copy.pop("llm_config", None)
        fcm_llm_config_id = data_copy.pop("fcm_llm_config", None)
        tools = data_copy.pop("tools", {})
        realtime_agent = data_copy.pop("realtime_agent", None)
        naive_search_config = data_copy.pop("naive_search_config", None)

        filters, null_filters = create_filters(data_copy)
        existing = Agent.objects.filter(**filters, **null_filters).first()
        return existing

    def _get_llm_configs(self, data: dict, id_mapper: IDMapper):
        old_llm_config_id = data.pop("llm_config", None)
        old_fcm_llm_config_id = data.pop("fcm_llm_config", None)

        llm_config_id = id_mapper.get_or_none(EntityType.LLM_CONFIG, old_llm_config_id)
        fcm_llm_config_id = id_mapper.get_or_none(
            EntityType.LLM_CONFIG, old_fcm_llm_config_id
        )

        llm_config = LLMConfig.objects.get(id=llm_config_id)
        fcm_llm_config = LLMConfig.objects.get(id=fcm_llm_config_id)
        return llm_config, fcm_llm_config

    def _get_tools(self, data: dict, id_mapper: IDMapper):
        tools = data.pop("tools", {})

        python_tools = [
            id_mapper.get_or_none(EntityType.PYTHON_CODE_TOOL, tool_id)
            for tool_id in tools.get(EntityType.PYTHON_CODE_TOOL, [])
        ]

        mcp_tools = [
            id_mapper.get_or_none(EntityType.MCP_TOOL, tool_id)
            for tool_id in tools.get(EntityType.MCP_TOOL, [])
        ]

        return python_tools, mcp_tools

    def _create_agent(self, data: dict) -> Agent:
        serializer = self.serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()

    def _assign_tools(self, agent: Agent, python_tools: list, mcp_tools: list):
        AgentPythonCodeTools.objects.bulk_create(
            [
                AgentPythonCodeTools(agent=agent, pythoncodetool_id=tool_id)
                for tool_id in python_tools
            ]
        )
        AgentMcpTools.objects.bulk_create(
            [AgentMcpTools(agent=agent, mcptool_id=tool_id) for tool_id in mcp_tools]
        )

    def _create_realtime_agent(self, agent, data, id_mapper: IDMapper):
        if not data:
            return

        old_realtime_config_id = data.pop("realtime_config", None)
        old_realtime_transcription_config_id = data.pop(
            "realtime_transcription_config", None
        )
        realtime_cofig_id = id_mapper.get_or_none(
            EntityType.REALTIME_CONFIG, old_realtime_config_id
        )
        realtime_transcription_config_id = id_mapper.get_or_none(
            EntityType.REALTIME_TRANSCRIPTION_CONFIG,
            old_realtime_transcription_config_id,
        )
        realtime_config = RealtimeConfig.objects.filter(id=realtime_cofig_id).first()
        realtime_transcription_config = RealtimeTranscriptionConfig.objects.filter(
            id=realtime_transcription_config_id
        ).first()

        realtime_agent = RealtimeAgent.objects.create(
            agent=agent,
            realtime_config=realtime_config,
            realtime_transcription_config=realtime_transcription_config,
            **data,
        )
        return realtime_agent

    def _create_naive_search_config(self, agent, data) -> NaiveRagSearchConfig:
        if not data:
            return

        data["agent"] = agent.id
        serializer = NaiveRagSearchConfigImportSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return serializer.save()
