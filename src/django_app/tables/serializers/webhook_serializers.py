from tables.models.webhook_models import WebhookTrigger
from tables.models.python_models import PythonCode
from tables.models.graph_models import WebhookTriggerNode
from tables.serializers.model_serializers import PythonCodeSerializer
from rest_framework import serializers


class WebhookTriggerNodeSerializer(serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta:
        model = WebhookTriggerNode
        fields = "__all__"

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        webhook_trigger: int | None = validated_data.pop("webhook_trigger")
        if webhook_trigger is None:
            webhook_trigger = WebhookTrigger.objects.create()
        webhook_trigger_node = WebhookTriggerNode.objects.create(
            python_code=python_code, webhook_trigger=webhook_trigger, **validated_data
        )
        return webhook_trigger_node

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)

        # Update nested PythonCode instance if provided
        if python_code_data:
            python_code = instance.python_code
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
        # Delegate to the update method for consistency
        return self.update(instance, validated_data)

class WebhookTriggerSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookTrigger
        fields = "__all__"