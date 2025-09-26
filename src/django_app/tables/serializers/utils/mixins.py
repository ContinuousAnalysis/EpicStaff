from rest_framework import serializers
from tables.models import Agent


class NestedAgentExportMixin:

    llm_config = serializers.SerializerMethodField()
    fcm_llm_config = serializers.SerializerMethodField()
    realtime_agent = serializers.SerializerMethodField()

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


class NestedAgentImportMixin:

    tools = serializers.DictField(required=False)
    llm_config = serializers.IntegerField(required=False, allow_null=True)
    fcm_llm_config = serializers.IntegerField(required=False, allow_null=True)
    realtime_agent = serializers.IntegerField(required=False, allow_null=True)
