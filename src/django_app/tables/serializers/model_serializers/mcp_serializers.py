from rest_framework import serializers

from crew.services.crew.mcp_tool_factory import McpTool


class McpToolSerializer(serializers.ModelSerializer):
    class Meta:
        model = McpTool
        fields = "__all__"
