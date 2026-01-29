from rest_framework import serializers

from tables.models import Agent, RealtimeAgent
from tables.import_export.enums import EntityType


class RealtimeAgentSerializer(serializers.ModelSerializer):

    class Meta:
        model = RealtimeAgent
        exclude = ["agent"]


class AgentSerializer(serializers.ModelSerializer):

    tools = serializers.JSONField(required=False)
    realtime_agent = RealtimeAgentSerializer(required=False)

    class Meta:
        model = Agent
        exclude = [
            "tags",
            "knowledge_collection",
        ]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["tools"] = {
            EntityType.PYTHON_CODE_TOOL: list(
                instance.python_code_tools.values_list("pythoncodetool_id", flat=True)
            ),
            EntityType.MCP_TOOL: list(
                instance.mcp_tools.values_list("mcptool_id", flat=True)
            ),
        }
        ret["realtime_agent"] = RealtimeAgentSerializer(instance.realtime_agent).data
        return ret
