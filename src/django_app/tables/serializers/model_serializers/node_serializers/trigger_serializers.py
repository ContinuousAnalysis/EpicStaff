from rest_framework import serializers

from tables.serializers.model_serializers.python_serializers import PythonCodeSerializer
from tables.models.graph_models import (
    TelegramTriggerNode,
    TelegramTriggerNodeField,
    WebhookTriggerNode,
)
from tables.models.webhook_models import WebhookTrigger
from tables.serializers.base_serializer import (
    BaseGraphEntityMixin,
    ContentHashWritableMixin,
)
from tables.serializers.utils.mixins import NestedPythonCodeMixin, WebhookCreationMixin
from tables.serializers.base_serializers import (
    WebhookTriggerNestedSerializer,
)


class WebhookTriggerNodeSerializer(
    BaseGraphEntityMixin,
    NestedPythonCodeMixin,
    WebhookCreationMixin,
    serializers.ModelSerializer,
):
    python_code = PythonCodeSerializer()

    webhook_trigger = WebhookTriggerNestedSerializer(required=False, allow_null=True)

    class Meta(BaseGraphEntityMixin.Meta):
        model = WebhookTriggerNode
        fields = [
            "id",
            "node_name",
            "graph",
            "python_code",
            "webhook_trigger",
        ] + BaseGraphEntityMixin.Meta.common_fields

    def to_internal_value(self, data):
        # COMMIT_COMMENTS: Accept webhook_trigger as int FK ID (sent by frontend
        # after loading from backend) in addition to nested dict — prevents
        # validation error when the frontend round-trips the serialized data.
        wt = data.get("webhook_trigger")
        if isinstance(wt, int):
            self._webhook_trigger_id = wt
            data = data.copy()
            data["webhook_trigger"] = None
        else:
            self._webhook_trigger_id = None
        return super().to_internal_value(data)

    def create(self, validated_data):
        webhook_trigger_data = validated_data.pop("webhook_trigger", None)
        wt_id = getattr(self, "_webhook_trigger_id", None)

        if wt_id:
            validated_data["webhook_trigger"] = WebhookTrigger.objects.filter(
                id=wt_id
            ).first()
        elif webhook_trigger_data:
            validated_data["webhook_trigger"], _ = self._get_or_create_webhook_trigger(
                webhook_trigger_data
            )

        return self._create_with_python_code(WebhookTriggerNode, validated_data)

    def update(self, instance, validated_data):
        wt_id = getattr(self, "_webhook_trigger_id", None)
        if wt_id:
            instance.webhook_trigger = WebhookTrigger.objects.filter(id=wt_id).first()
            validated_data.pop("webhook_trigger", None)
        elif "webhook_trigger" in validated_data:
            webhook_trigger_data = validated_data.pop("webhook_trigger")

            if webhook_trigger_data:
                webhook_trigger_instance, _ = self._get_or_create_webhook_trigger(
                    webhook_trigger_data
                )
                instance.webhook_trigger = webhook_trigger_instance
            else:
                instance.webhook_trigger = None

        return super().update(instance, validated_data)


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
