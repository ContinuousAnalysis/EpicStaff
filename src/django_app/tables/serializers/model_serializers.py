from loguru import logger

from tables.serializers.base_serializer import (
    ContentHashWritableMixin,
)
from tables.models.webhook_models import (
    WebhookTrigger,
    NgrokWebhookConfig,
    VoiceSettings,
)
from rest_framework import serializers
from tables.models import PythonCode
from tables.models.rbac_models import Organization, OrganizationUser
from tables.models.llm_models import (
    DefaultLLMConfig,
)
from tables.models.vector_models import MemoryDatabase
from tables.models.label_models import Label
from tables.services.persistent_variables_service import PersistentVariablesService


class DefaultLLMConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultLLMConfig
        fields = "__all__"


class PythonCodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    libraries = serializers.ListField(
        child=serializers.CharField(),
        write_only=False,
        help_text="A list of library names.",
    )

    class Meta:
        model = PythonCode
        fields = "__all__"
        read_only_fields = ["id"]
        extra_kwargs = {
            "code": {"allow_blank": True},
            "entrypoint": {"allow_blank": True},
        }

    def to_representation(self, instance):
        """Convert 'libraries' string to a list of strings for output."""
        representation = super().to_representation(instance)
        representation["libraries"] = (
            list(filter(None, instance.libraries.split(" ")))
            if instance.libraries
            else []
        )
        return representation

    def to_internal_value(self, data):
        """Convert 'libraries' list of strings to a space-separated string for storage."""
        internal_value = super().to_internal_value(data)
        libraries = data.get("libraries") or []
        if isinstance(libraries, list):
            internal_value["libraries"] = " ".join(libraries)
        return internal_value


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoryDatabase
        fields = ["id", "payload"]


class WebhookTriggerSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookTrigger
        fields = "__all__"


class NgrokWebhookConfigModelSerializer(serializers.ModelSerializer):
    webhook_full_url = serializers.SerializerMethodField()

    class Meta:
        model = NgrokWebhookConfig
        fields = [
            "id",
            "name",
            "auth_token",
            "domain",
            "region",
            "webhook_full_url",
        ]

    def get_webhook_full_url(self, instance: NgrokWebhookConfig):
        from tables.services.webhook_trigger_service import WebhookTriggerService

        try:
            return WebhookTriggerService().get_tunnel_url(ngrok_webhook_config=instance)
        except Exception as e:
            logger.error(f"Failed to read tunnel URL for '{instance.name}': {e}")
        return None


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class OrganizationUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrganizationUser
        fields = ["id", "user", "org", "role", "joined_at"]
        read_only_fields = ["id", "joined_at"]


class LabelSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(read_only=True)

    class Meta:
        model = Label
        fields = ["id", "name", "parent", "created_at", "metadata", "full_path"]
        read_only_fields = ["id", "created_at", "full_path"]
        extra_kwargs = {
            "name": {"validators": []},
        }

    def validate(self, attrs):
        name = attrs.get("name")
        parent = attrs.get("parent")

        if parent is None:
            if Label.objects.filter(name=name, parent__isnull=True).exists():
                raise serializers.ValidationError(
                    {"name": "Top-level label with this name already exists."}
                )
        else:
            if Label.objects.filter(name=name, parent=parent).exists():
                raise serializers.ValidationError(
                    {"name": "Label with this name already exists under this parent."}
                )

        return attrs


class VoiceSettingsSerializer(serializers.ModelSerializer):
    voice_stream_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = VoiceSettings
        fields = [
            "twilio_account_sid",
            "twilio_auth_token",
            "voice_agent",
            "ngrok_config",
            "voice_stream_url",
        ]

    def get_voice_stream_url(self, obj):
        if not obj.ngrok_config:
            return None
        from tables.services.webhook_trigger_service import WebhookTriggerService

        try:
            base = WebhookTriggerService().get_tunnel_url(
                ngrok_webhook_config=obj.ngrok_config
            )
        except Exception:
            base = None
        if not base and obj.ngrok_config.domain:
            base = f"https://{obj.ngrok_config.domain}"
        if base:
            return (
                base.rstrip("/")
                .replace("https://", "wss://")
                .replace("http://", "wss://")
                + "/voice/stream"
            )
        return None
