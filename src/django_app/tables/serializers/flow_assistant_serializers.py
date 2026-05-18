from rest_framework import serializers

from tables.models.flow_assistant_models import FlowAssistant, FlowAssistantConversation


class FlowAssistantSerializer(serializers.ModelSerializer):
    """Read + write serializer for FlowAssistant config."""

    system_prompt_preview = serializers.SerializerMethodField()

    class Meta:
        model = FlowAssistant
        fields = [
            "id",
            "llm_config",
            "system_prompt_preview",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at", "system_prompt_preview"]

    def get_system_prompt_preview(self, instance: FlowAssistant) -> str:
        from tables.services.flow_assistant import FlowAssistantService

        return FlowAssistantService().build_system_prompt(instance)


class FlowAssistantConversationSerializer(serializers.ModelSerializer):
    """Read serializer for FlowAssistantConversation (full history)."""

    class Meta:
        model = FlowAssistantConversation
        fields = [
            "id",
            "flow_assistant",
            "organization_user",
            "title",
            "messages",
            "started_at",
            "last_message_at",
        ]
        read_only_fields = [
            "id",
            "flow_assistant",
            "organization_user",
            "title",
            "started_at",
            "last_message_at",
        ]


class SessionSummarySerializer(serializers.ModelSerializer):
    """Lightweight session list row — no messages payload."""

    message_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = FlowAssistantConversation
        fields = [
            "id",
            "title",
            "started_at",
            "last_message_at",
            "message_count",
        ]


class _OrganizationUserNestedSerializer(serializers.Serializer):
    """Inline org-user representation for the audit serializer."""

    id = serializers.IntegerField(source="pk")
    user_id = serializers.IntegerField()
    user_email = serializers.SerializerMethodField()
    organization_id = serializers.IntegerField(source="org_id")
    organization_name = serializers.SerializerMethodField()

    def get_user_email(self, instance) -> str:
        return instance.user.email

    def get_organization_name(self, instance) -> str:
        return instance.org.name


class AuditConversationSerializer(serializers.ModelSerializer):
    """Full conversation row for the superadmin audit endpoint."""

    message_count = serializers.IntegerField(read_only=True)
    organization_user = _OrganizationUserNestedSerializer(read_only=True)

    class Meta:
        model = FlowAssistantConversation
        fields = [
            "id",
            "organization_user",
            "flow_assistant",
            "title",
            "started_at",
            "last_message_at",
            "deleted_at",
            "message_count",
        ]


class StartConversationSerializer(serializers.Serializer):
    """Empty body — signals the intent to start a new conversation."""

    pass


class SendMessageSerializer(serializers.Serializer):
    """Body for the send-message endpoint."""

    message = serializers.CharField(required=True, max_length=8000)
