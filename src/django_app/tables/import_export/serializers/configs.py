from rest_framework import serializers

from tables.models import (
    Provider,
    LLMConfig,
    LLMModel,
    EmbeddingModel,
    EmbeddingConfig,
    RealtimeModel,
    RealtimeConfig,
    RealtimeTranscriptionModel,
    RealtimeTranscriptionConfig,
)


class BaseConfigSerializer(serializers.ModelSerializer):

    model_name = serializers.CharField(required=False)
    provider_name = serializers.CharField(required=False)
    api_key = serializers.CharField(write_only=True, required=False)

    model_class = None
    provider_field = None
    config_model = None
    model_fk_field = None

    class Meta:
        abstract = True
        model = None
        exclude = ["model"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        model = self._get_model_instance(instance)
        ret["model_name"] = model.name
        ret["provider_name"] = getattr(model, self.provider_field).name
        return ret

    def create(self, validated_data):
        model_name = validated_data.pop("model_name", None)
        provider_name = validated_data.pop("provider_name", None)

        if model_name and provider_name:
            provider = Provider.objects.get(name=provider_name)
            model_obj = self.model_class.objects.get(
                name=model_name,
                **{self.provider_field: provider},
            )
            validated_data[self.model_fk_field] = model_obj
            validated_data["api_key"] = self._get_api_key(provider_name)

        return self.create(validated_data)

    def _get_api_key(self, provider_name):
        return (
            self.config_model.objects.filter(
                **{f"{self.model_fk_field}__{self.provider_field}__name": provider_name}
            )
            .values_list("api_key", flat=True)
            .first()
        )

    def _get_model_instance(self, instance):
        return getattr(instance, self.model_fk_field)


class EmbeddingConfigSerializer(BaseConfigSerializer):

    model_class = EmbeddingModel
    provider_field = "embedding_provider"
    model_fk_field = "model"
    config_model = EmbeddingConfig

    class Meta(BaseConfigSerializer.Meta):
        model = EmbeddingConfig


class LLMConfigSerializer(BaseConfigSerializer):

    model_class = LLMModel
    provider_field = "llm_provider"
    model_fk_field = "model"
    config_model = LLMConfig

    class Meta(BaseConfigSerializer.Meta):
        model = LLMConfig


class RealtimeConfigSerializer(BaseConfigSerializer):

    model_class = RealtimeModel
    provider_field = "provider"
    model_fk_field = "realtime_model"
    config_model = RealtimeConfig

    class Meta(BaseConfigSerializer.Meta):
        model = RealtimeConfig
        exclude = ["realtime_model"]


class RealtimeTranscriptionConfigSerializer(BaseConfigSerializer):

    model_class = RealtimeTranscriptionModel
    provider_field = "provider"
    model_fk_field = "realtime_transcription_model"
    config_model = RealtimeTranscriptionConfig

    class Meta(BaseConfigSerializer.Meta):
        model = RealtimeTranscriptionConfig
        exclude = ["realtime_transcription_model"]
