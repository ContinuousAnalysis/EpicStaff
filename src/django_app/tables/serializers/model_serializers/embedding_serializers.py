from rest_framework import serializers

from tables.models.tag_models import EmbeddingConfigTag, EmbeddingModelTag
from tables.serializers.utils.mixins import TagHandlingMixin
from tables.models.embedding_models import (
    DefaultEmbeddingConfig,
    EmbeddingConfig,
    EmbeddingModel,
)

from tables.serializers.model_serializers.tag_serializers import (
    EmbeddingConfigTagSerializer,
    EmbeddingTagSerializer,
)


class EmbeddingModelSerializer(TagHandlingMixin, serializers.ModelSerializer):
    tags = EmbeddingTagSerializer(many=True, required=False)
    tag_model = EmbeddingModelTag

    class Meta:
        model = EmbeddingModel
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


class EmbeddingConfigSerializer(TagHandlingMixin, serializers.ModelSerializer):
    tags = EmbeddingConfigTagSerializer(many=True, required=False)
    tag_model = EmbeddingConfigTag

    class Meta:
        model = EmbeddingConfig
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


class DefaultEmbeddingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultEmbeddingConfig
        fields = [
            "model",
            "task_type",
            "api_key",
        ]
