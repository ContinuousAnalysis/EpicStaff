from loguru import logger
from rest_framework import serializers
from tables.models import (
    TelegramTriggerNode,
    TelegramTriggerNodeField,
    WebhookTrigger,
    NgrokWebhookConfig,
)


class TelegramTriggerNodeFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelegramTriggerNodeField
        fields = [
            "id",
            "parent",
            "field_name",
            "variable_path",
        ]


class TelegramTriggerNodeSerializer(serializers.ModelSerializer):
    fields = TelegramTriggerNodeFieldSerializer(many=True)
    webhook_full_url = serializers.SerializerMethodField()

    class Meta:
        model = TelegramTriggerNode
        fields = [
            "id",
            "node_name",
            "telegram_bot_api_key",
            "graph",
            "fields",
            "webhook_trigger",
            "webhook_full_url",
        ]


    def get_webhook_full_url(self, instance: TelegramTriggerNode):
        from tables.services.webhook_trigger_service import WebhookTriggerService
        webhook_trigger = instance.webhook_trigger
        if webhook_trigger is None:
            return None
        
        if hasattr(webhook_trigger, "ngrok_webhook_config") and webhook_trigger.ngrok_webhook_config is not None:
            try:
                return WebhookTriggerService().get_tunnel_url(webhook_trigger=webhook_trigger)
            except Exception as e:
                logger.exception()
        return None

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])
        webhook_trigger = validated_data.pop("webhook_trigger", None)

        node = TelegramTriggerNode.objects.create(**validated_data)

        node.webhook_trigger = webhook_trigger
        node.save()

        for item in fields_data:
            TelegramTriggerNodeField.objects.create(telegram_trigger_node=node, **item)

        return node

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if fields_data is not None:
            # Delete old fields and recreate new ones (simple nested update strategy)
            instance.fields.all().delete()
            for item in fields_data:
                TelegramTriggerNodeField.objects.create(
                    telegram_trigger_node=instance, **item
                )

        return instance


class TelegramTriggerNodeDataFieldsSerializer(serializers.Serializer):
    data = serializers.JSONField()
