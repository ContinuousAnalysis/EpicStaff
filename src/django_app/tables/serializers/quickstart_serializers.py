from rest_framework import serializers

from tables.models.provider import Provider
from tables.serializers.model_serializers import (
    LLMConfigSerializer,
    EmbeddingConfigSerializer,
    RealtimeConfigSerializer,
    RealtimeTranscriptionConfigSerializer,
)


class QuickstartSerializer(serializers.Serializer):
    provider = serializers.CharField()
    api_key = serializers.CharField()

    def validate_provider(self, value):
        if not Provider.objects.filter(name=value).exists():
            raise serializers.ValidationError(f"Provider '{value}' does not exist.")
        return value


class QuickstartConfigSerializer(serializers.Serializer):
    config_name = serializers.CharField()
    llm_config = LLMConfigSerializer(allow_null=True)
    embedding_config = EmbeddingConfigSerializer(allow_null=True)
    realtime_config = RealtimeConfigSerializer(allow_null=True)
    realtime_transcription_config = RealtimeTranscriptionConfigSerializer(
        allow_null=True
    )


class QuickstartStatusSerializer(serializers.Serializer):
    supported_providers = serializers.ListField(child=serializers.CharField())
    last_config = QuickstartConfigSerializer(allow_null=True)
    is_synced = serializers.BooleanField()
