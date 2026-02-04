from rest_framework import serializers

from tables.models import McpTool


class McpToolSerializer(serializers.ModelSerializer):

    class Meta:
        model = McpTool
        fields = "__all__"
