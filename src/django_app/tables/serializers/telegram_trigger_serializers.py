from rest_framework import serializers

from tables.models import (
    TelegramTriggerNode,
    TelegramTriggerNodeField,
)
from tables.serializers.base_serializer import (
    BaseGraphEntityMixin,
    ContentHashWritableMixin,
)
from tables.serializers.base_serializers import WebhookTriggerNestedSerializer
from tables.serializers.utils.mixins import WebhookCreationMixin


class TelegramTriggerNodeFieldSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    class Meta:
        model = TelegramTriggerNodeField
        fields = [
            "id",
            "parent",
            "field_name",
            "variable_path",
            "content_hash",
        ]


class TelegramTriggerNodeSerializer(
    ContentHashWritableMixin, WebhookCreationMixin, serializers.ModelSerializer
):
    webhook_trigger = WebhookTriggerNestedSerializer(required=False, allow_null=True)
    fields = TelegramTriggerNodeFieldSerializer(many=True)

    class Meta(BaseGraphEntityMixin.Meta):
        model = TelegramTriggerNode
        fields = [
            "id",
            "node_name",
            "telegram_bot_api_key",
            "graph",
            "fields",
            "webhook_trigger",
        ] + BaseGraphEntityMixin.Meta.common_fields

    def create(self, validated_data):
        fields_data = validated_data.pop("fields", [])

        webhook_trigger_data = validated_data.pop("webhook_trigger", None)
        webhook_trigger_instance = None

        if webhook_trigger_data:
            webhook_trigger_instance, _ = self._get_or_create_webhook_trigger(
                webhook_trigger_data
            )

        node = TelegramTriggerNode.objects.create(
            webhook_trigger=webhook_trigger_instance, **validated_data
        )
        for item in fields_data:
            TelegramTriggerNodeField.objects.create(telegram_trigger_node=node, **item)

        return node

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)

        if "webhook_trigger" in validated_data:
            webhook_trigger_data = validated_data.pop("webhook_trigger")

            webhook_trigger_instance = None
            if webhook_trigger_data:
                webhook_trigger_instance, _ = self._get_or_create_webhook_trigger(
                    webhook_trigger_data
                )

            instance.webhook_trigger = webhook_trigger_instance

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if fields_data is not None:
            instance.fields.all().delete()
            for item in fields_data:
                TelegramTriggerNodeField.objects.create(
                    telegram_trigger_node=instance, **item
                )

        return instance


class TelegramTriggerNodeDataFieldsSerializer(serializers.Serializer):
    data = serializers.JSONField()
