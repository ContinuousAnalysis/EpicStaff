from rest_framework import serializers

from django_app.tables.models.realtime_models import (
    RealtimeAgent,
    RealtimeAgentChat,
    RealtimeSessionItem,
)


class RealtimeAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeAgent
        exclude = ["agent"]


class RealtimeSessionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeSessionItem
        fields = "__all__"


class RealtimeAgentChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeAgentChat
        fields = "__all__"
