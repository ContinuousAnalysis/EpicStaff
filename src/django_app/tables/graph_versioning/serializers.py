from rest_framework import serializers

from tables.models import GraphVersion


class GraphVersionCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)


class GraphVersionReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphVersion
        fields = [
            "id",
            "graph",
            "name",
            "description",
            "dependencies",
            "created_at",
        ]
