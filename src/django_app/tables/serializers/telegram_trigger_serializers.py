from rest_framework import serializers
from tables.models import (
    TelegramTriggerNode, 
    TelegramTriggerNodeField, 
    WebhookTrigger, 
    NgrokWebhookConfig
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
    
    # write_only
    ngrok_webhook_config_id = serializers.PrimaryKeyRelatedField(
        queryset=NgrokWebhookConfig.objects.all(),
        required=False,
        allow_null=True,
        write_only=True,
    )

    # read_only
    webhook_full_url = serializers.SerializerMethodField()

    class Meta:
        model = TelegramTriggerNode
        fields = [
            "id",
            "node_name",
            "telegram_bot_api_key",
            "graph",
            "fields",
            "ngrok_webhook_config_id",
            "webhook_full_url",
        ]

    def get_webhook_full_url(self, instance):
        if instance.webhook_trigger and hasattr(instance.webhook_trigger, 'ngrok_webhook_config'):
            config = instance.webhook_trigger.ngrok_webhook_config
            if config and config.domain:
                return f"https://{config.domain}/{instance.webhook_trigger.path}/"
        return None

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])
        ngrok_config = validated_data.pop("ngrok_webhook_config_id", None)

        node = TelegramTriggerNode.objects.create(**validated_data)

        webhook_trigger, _ = WebhookTrigger.objects.get_or_create(
            path=str(node.url_path)
        )

        if ngrok_config:
            webhook_trigger.ngrok_webhook_config = ngrok_config
            webhook_trigger.save()

        node.webhook_trigger = webhook_trigger
        node.save()

        for item in fields_data:
            TelegramTriggerNodeField.objects.create(telegram_trigger_node=node, **item)

        return node

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)
        ngrok_config = validated_data.pop("ngrok_webhook_config_id", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if ngrok_config is not None or 'ngrok_webhook_config_id' in self.initial_data:
            if not instance.webhook_trigger:
                instance.webhook_trigger, _ = WebhookTrigger.objects.get_or_create(
                    path=str(instance.url_path)
                )
                instance.save()
            
            instance.webhook_trigger.ngrok_webhook_config = ngrok_config
            instance.webhook_trigger.save()

        if fields_data is not None:
            instance.fields.all().delete()
            for item in fields_data:
                TelegramTriggerNodeField.objects.create(
                    telegram_trigger_node=instance, **item
                )

        return instance


class TelegramTriggerNodeDataFieldsSerializer(serializers.Serializer):
    data = serializers.JSONField()
