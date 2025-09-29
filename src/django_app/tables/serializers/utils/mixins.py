from tables.models import Agent


class NestedAgentExportMixin:

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

    def get_realtime_agent(self, agent: Agent):
        if agent.realtime_agent:
            return agent.realtime_agent.pk


class NestedCrewExportMixin:

    def get_agents(self, crew):
        agents = list(crew.agents.all().values_list("id", flat=True))
        return agents
