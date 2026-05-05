from rest_framework import serializers

from django_app.tables.models.tag_models import LLMConfigTag, LLMModelTag
from tables.models.llm_models import (
    DefaultLLMConfig,
    LLMConfig,
    LLMModel,
    RealtimeModel,
    RealtimeConfig,
    RealtimeTranscriptionModel,
    RealtimeTranscriptionConfig,
)


class DefaultLLMConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultLLMConfig
        fields = "__all__"


class RealtimeModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeModel
        fields = "__all__"


class RealtimeConfigSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(
        source="realtime_model.provider.name", read_only=True
    )

    class Meta:
        model = RealtimeConfig
        fields = "__all__"


class RealtimeTranscriptionModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeTranscriptionModel
        fields = "__all__"


class RealtimeTranscriptionConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeTranscriptionConfig
        fields = "__all__"


class LLMConfigSerializer(TagHandlingMixin, serializers.ModelSerializer):
    tags = LLMConfigTagSerializer(many=True, required=False)
    tag_model = LLMConfigTag

    class Meta:
        model = LLMConfig
        fields = "__all__"

    def create(self, validated_data):
        tags_data = validated_data.pop("tags", [])
        instance = super().create(validated_data)
        if tags_data:
            resolved_tags = self._resolve_tags(tags_data)
            self._validate_predefined_tags_on_create(resolved_tags)
            instance.tags.set(resolved_tags)
        return instance

    def update(self, instance, validated_data):
        tags_data = validated_data.pop("tags", None)
        if tags_data is not None:
            resolved_tags = self._resolve_tags(tags_data)
            self._validate_predefined_tags_on_update(instance, resolved_tags)
            instance.tags.set(resolved_tags)
        return super().update(instance, validated_data)


class LLMModelSerializer(TagHandlingMixin, serializers.ModelSerializer):
    capabilities = LLMModelTagSerializer(source="tags", many=True, required=False)
    tag_model = LLMModelTag

    class Meta:
        model = LLMModel
        fields = "__all__"

    def create(self, validated_data):
        tags_data = validated_data.pop("tags", [])
        instance = super().create(validated_data)

        if tags_data:
            resolved_tags = self._resolve_tags(tags_data)
            self._validate_predefined_tags_on_create(resolved_tags)
            instance.tags.set(resolved_tags)

        return instance

    def update(self, instance, validated_data):
        tags_data = validated_data.pop("tags", None)

        if tags_data is not None:
            resolved_tags = self._resolve_tags(tags_data)

            self._validate_predefined_tags_on_update(instance, resolved_tags)

            instance.tags.set(resolved_tags)

        return super().update(instance, validated_data)
