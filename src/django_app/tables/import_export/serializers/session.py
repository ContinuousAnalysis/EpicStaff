from rest_framework import serializers

from tables.models.graph_models import GraphSessionMessage


class GraphSessionMessageExportSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphSessionMessage
        fields = [
            "id",
            "session_id",
            "created_at",
            "name",
            "execution_order",
            "uuid",
            "message_data",
        ]
