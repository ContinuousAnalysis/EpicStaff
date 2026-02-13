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


class BaseConfigImportSerializer(serializers.ModelSerializer):
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

        return super().create(validated_data)

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


class LLMConfigImportSerializer(serializers.ModelSerializer):
    model_id = serializers.PrimaryKeyRelatedField(
        queryset=LLMModel.objects.all(),
        source="model",
        write_only=True,
    )
    api_key = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = LLMConfig
        fields = "__all__"

    def create(self, validated_data):
        model = validated_data["model"]
        validated_data["api_key"] = self._get_api_key(model.llm_provider.name)

        return super().create(validated_data)

    def _get_api_key(self, provider_name):
        return (
            LLMConfig.objects.filter(model__llm_provider__name=provider_name)
            .values_list("api_key", flat=True)
            .first()
        )


class EmbeddingConfigImportSerializer(BaseConfigImportSerializer):
    model_class = EmbeddingModel
    provider_field = "embedding_provider"
    model_fk_field = "model"
    config_model = EmbeddingConfig

    class Meta(BaseConfigImportSerializer.Meta):
        model = EmbeddingConfig


class RealtimeConfigImportSerializer(BaseConfigImportSerializer):
    model_class = RealtimeModel
    provider_field = "provider"
    model_fk_field = "realtime_model"
    config_model = RealtimeConfig

    class Meta(BaseConfigImportSerializer.Meta):
        model = RealtimeConfig
        exclude = ["realtime_model"]


class RealtimeTranscriptionConfigImportSerializer(BaseConfigImportSerializer):
    model_class = RealtimeTranscriptionModel
    provider_field = "provider"
    model_fk_field = "realtime_transcription_model"
    config_model = RealtimeTranscriptionConfig

    class Meta(BaseConfigImportSerializer.Meta):
        model = RealtimeTranscriptionConfig
        exclude = ["realtime_transcription_model"]
