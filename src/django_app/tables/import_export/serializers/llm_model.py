from rest_framework import serializers

from tables.models import LLMModel, Provider


class LLMModelImportSerializer(serializers.ModelSerializer):
    provider_id = serializers.PrimaryKeyRelatedField(
        queryset=Provider.objects.all(),
        source="llm_provider",
        write_only=True,
    )

    class Meta:
        model = LLMModel
        exclude = ["llm_provider"]

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        ret["provider_name"] = instance.llm_provider.name
        return ret
