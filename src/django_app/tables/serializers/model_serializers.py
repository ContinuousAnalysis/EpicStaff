from django.db import transaction
from loguru import logger

from django_app.tables.models.provider import Provider
from tables.serializers.base_serializer import (
    BaseGraphEntityMixin,
    ContentHashWritableMixin,
)
from tables.serializers.telegram_trigger_serializers import (
    TelegramTriggerNodeSerializer,
)
from tables.validators.python_code_tool_config_validator import (
    PythonCodeToolConfigValidator,
)
from tables.models.python_models import PythonCodeToolConfig, PythonCodeToolConfigField
from tables.models.webhook_models import (
    WebhookTrigger,
    NgrokWebhookConfig,
    VoiceSettings,
)
from tables.models.graph_models import GraphNote, WebhookTriggerNode
from tables.models.mcp_models import McpTool
from tables.serializers.serializers import BaseToolSerializer
from tables.models import (
    ConditionalEdge,
    CrewNode,
    Edge,
    Graph,
    GraphSessionMessage,
    PythonNode,
    FileExtractorNode,
    SubGraphNode,
    AudioTranscriptionNode,
)
from rest_framework import serializers
from tables.exceptions import (
    BuiltInToolModificationError,
    PythonCodeToolConfigSerializerError,
)
from tables.models import PythonCode, PythonCodeResult, PythonCodeTool
from tables.models.crew_models import (
    Crew,
)
from tables.models.graph_models import (
    CodeAgentNode,
    Condition,
    ConditionGroup,
    DecisionTableNode,
    EndNode,
    LLMNode,
    StartNode,
    GraphOrganization,
    GraphOrganizationUser,
    WebhookTriggerNode,
)
from tables.models.rbac_models import Organization, OrganizationUser
from tables.models.llm_models import (
    DefaultLLMConfig,
)
from tables.models.realtime_models import (
    RealtimeSessionItem,
    RealtimeAgent,
    RealtimeAgentChat,
)
from tables.models.vector_models import MemoryDatabase
from tables.models.label_models import Label
from tables.models import (
    AgentSessionMessage,
    TaskSessionMessage,
    Session,
    UserSessionMessage,
)
from tables.constants.variables_constants import (
    DOMAIN_VARIABLES_KEY,
    DOMAIN_ORGANIZATION_KEY,
    DOMAIN_USER_KEY,
    DOMAIN_PERSISTENT_KEY,
)
from tables.services.persistent_variables_service import PersistentVariablesService
from tables.serializers.base_serializers import WebhookTriggerNestedSerializer
from django.core.exceptions import ValidationError


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


class PythonCodeToolConfigFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = PythonCodeToolConfigField
        fields = [
            "id",
            "name",
            "tool",
            "description",
            "data_type",
            "required",
            "secret",
        ]


class PythonCodeToolSerializer(serializers.ModelSerializer):
    python_code = PythonCodeSerializer()
    tool_fields = PythonCodeToolConfigFieldSerializer(many=True, read_only=True)
    built_in = serializers.ReadOnlyField()

    class Meta:
        model = PythonCodeTool
        fields = [
            "id",
            "name",
            "description",
            "args_schema",
            "python_code",
            "favorite",
            "built_in",
            "tool_fields",
        ]
        read_only_fields = ["id", "built_in", "tool_fields"]

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        python_code_tool = PythonCodeTool.objects.create(
            python_code=python_code, **validated_data
        )
        return python_code_tool

    def update(self, instance, validated_data):
        if instance.built_in:
            raise BuiltInToolModificationError()

        python_code_data = validated_data.pop("python_code", None)

        if python_code_data:
            python_code = instance.python_code
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        for attr, value in validated_data.items():
            if attr != "built_in":
                setattr(instance, attr, value)
        instance.save()

        return instance


class PythonCodeToolConfigSerializer(serializers.ModelSerializer):
    def __init__(self, *args, tool_config_validator=None, **kwargs):
        super().__init__(*args, **kwargs)

        self.tool_config_validator = (
            tool_config_validator
            or PythonCodeToolConfigValidator(
                validate_null_fields=True,
                validate_missing_required_fields=True,
            )
        )

    class Meta:
        model = PythonCodeToolConfig
        fields = "__all__"

    def validate(self, data: dict):
        name = data.get("name")
        tool = data.get("tool")
        configuration = data.get("configuration", dict())

        if name is None:
            raise PythonCodeToolConfigSerializerError(
                "Name for configuration is not provided."
            )
        if tool is None:
            raise PythonCodeToolConfigSerializerError("Tool is not provided.")
        if configuration is None:
            raise PythonCodeToolConfigSerializerError("Configuration is not provided.")

        try:
            validated_configuration = self.tool_config_validator.validate(
                name=name,
                tool=tool,
                configuration=configuration,
            )
            data["configuration"] = validated_configuration
        except ValidationError as e:
            raise PythonCodeToolConfigSerializerError(e.message)

        return data


class McpToolSerializer(serializers.ModelSerializer):
    class Meta:
        model = McpTool
        fields = "__all__"


class RealtimeAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeAgent
        exclude = ["agent"]


class UserSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSessionMessage

        fields = "__all__"


class TaskSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskSessionMessage

        fields = "__all__"


class AgentSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentSessionMessage
        fields = "__all__"


class PythonCodeResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = PythonCodeResult
        fields = "__all__"


class CrewNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    crew = CrewSerializer(read_only=True)
    crew_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = CrewNode
        fields = "__all__"
        read_only_fields = ["crew"]

    def validate_crew_id(self, value):
        if not Crew.objects.only("id").filter(id=value).exists():
            raise serializers.ValidationError("Invalid crew_id: crew does not exist.")
        return value

    def update(self, instance, validated_data):
        if "crew_id" in validated_data:
            instance.crew_id = validated_data["crew_id"]
        return super().update(instance, validated_data)


class PythonNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta:
        model = PythonNode
        fields = "__all__"

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        pytohn_node = PythonNode.objects.create(
            python_code=python_code, **validated_data
        )
        return pytohn_node

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)

        # Update nested PythonCode instance if provided
        if python_code_data:
            python_code = instance.python_code
            expected_hash = python_code_data.pop("content_hash", None)
            if expected_hash is not None:
                python_code._expected_hash = expected_hash
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        # Update PythonNode fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
        # Delegate to the update method for consistency
        return self.update(instance, validated_data)


class FileExtractorNodeSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    class Meta:
        model = FileExtractorNode
        fields = "__all__"


class AudioTranscriptionNodeSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    class Meta:
        model = AudioTranscriptionNode
        fields = "__all__"


class LLMNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta:
        model = LLMNode
        fields = "__all__"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["llm_config_detail"] = LLMConfigSerializer(instance.llm_config).data
        return data


class CodeAgentNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CodeAgentNode
        fields = "__all__"


class EdgeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta(BaseGraphEntityMixin.Meta):
        model = Edge
        fields = "__all__"


class SubGraphNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    class Meta(BaseGraphEntityMixin.Meta):
        model = SubGraphNode
        fields = "__all__"

    def validate(self, attrs):
        graph = attrs.get("graph") or getattr(self.instance, "graph", None)
        subgraph = attrs.get("subgraph") or getattr(self.instance, "subgraph", None)

        if graph and subgraph and graph == subgraph:
            raise serializers.ValidationError("Graph and subgraph cannot be the same.")

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["subgraph_detail"] = GraphLightSerializer(instance.subgraph).data
        return data


class ConditionalEdgeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta(BaseGraphEntityMixin.Meta):
        model = ConditionalEdge
        fields = "__all__"

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        conditional_edge = ConditionalEdge.objects.create(
            python_code=python_code, **validated_data
        )
        return conditional_edge

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)

        # Update nested PythonCode instance if provided
        if python_code_data:
            python_code = instance.python_code
            expected_hash = python_code_data.pop("content_hash", None)
            if expected_hash is not None:
                python_code._expected_hash = expected_hash
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        # Update PythonNode fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
        # Delegate to the update method for consistency
        return self.update(instance, validated_data)


class StartNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    node_name = serializers.SerializerMethodField(read_only=True)

    class Meta(BaseGraphEntityMixin.Meta):
        model = StartNode
        fields = [
            "id",
            "graph",
            "variables",
            "node_name",
        ] + BaseGraphEntityMixin.Meta.common_fields
        read_only_fields = ["node_name"]

    def get_node_name(self, obj):
        return "__start__"

    @transaction.atomic
    def update(self, instance, validated_data):
        old_variables = instance.variables.copy() if instance.variables else {}

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        graph_organization = GraphOrganization.objects.filter(
            graph=instance.graph
        ).first()

        if graph_organization:
            service = PersistentVariablesService()
            service.sync_graph_organization(
                graph_organization, old_variables, instance.variables
            )

        return instance

    def validate(self, attrs):
        variables = attrs.get("variables")
        actual_variables = variables.get(DOMAIN_VARIABLES_KEY, {})

        persistent_variables = variables.get(DOMAIN_PERSISTENT_KEY, {})
        organization_variables = persistent_variables.get(DOMAIN_ORGANIZATION_KEY, [])
        user_variables = persistent_variables.get(DOMAIN_USER_KEY, [])

        service = PersistentVariablesService()
        for path in organization_variables + user_variables:
            value = service.get_by_path(actual_variables, path)
            if value is None:
                raise ValidationError(
                    f"Path {path} in {DOMAIN_PERSISTENT_KEY} does not exist in {DOMAIN_VARIABLES_KEY}."
                )

        return super().validate(attrs)


class EndNodeSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    node_name = serializers.SerializerMethodField(read_only=True)

    class Meta(BaseGraphEntityMixin.Meta):
        model = EndNode
        fields = [
            "id",
            "graph",
            "output_map",
            "node_name",
        ] + BaseGraphEntityMixin.Meta.common_fields
        read_only_fields = ["node_name"]

    def get_node_name(self, obj):
        return "__end_node__"


class SessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Session
        fields = "__all__"
        read_only_fields = [
            "id",
            "status",
            "status_updated_at",
            "variables",
            "created_at",
            "finished_at",
            "graph",
            "graph_schema",
            "parent_session",
        ]


class SessionLightSerializer(serializers.ModelSerializer):
    has_output_files = serializers.BooleanField(read_only=True)
    graph_name = serializers.CharField(source="graph.name", read_only=True)

    class Meta:
        model = Session
        fields = (
            "id",
            "graph_id",
            "graph_name",
            "status",
            "status_updated_at",
            "created_at",
            "finished_at",
            "parent_session",
            "has_output_files",
        )


class GraphSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphSessionMessage
        fields = "__all__"


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoryDatabase
        fields = ["id", "payload"]


class GraphLightBaseSerializer(serializers.ModelSerializer):
    tags = GraphTagSerializer(many=True, read_only=True)
    label_ids = serializers.PrimaryKeyRelatedField(
        many=True, read_only=True, source="labels"
    )

    class Meta:
        model = Graph
        fields = [
            "id",
            "name",
            "description",
            "tags",
            "epicchat_enabled",
            "label_ids",
            "created_at",
            "updated_at",
        ]


class GraphLightSerializer(GraphLightBaseSerializer):
    subflows = serializers.SerializerMethodField()

    class Meta(GraphLightBaseSerializer.Meta):
        fields = GraphLightBaseSerializer.Meta.fields + ["subflows"]

    def get_subflows(self, obj):
        graphs = Graph.objects.get_transitive_subflows(obj.id)
        return GraphLightBaseSerializer(graphs, many=True).data


class RealtimeSessionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeSessionItem
        fields = "__all__"


class RealtimeAgentChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeAgentChat
        fields = "__all__"


class ConditionSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    condition_group = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Condition
        fields = "__all__"


class ConditionGroupSerializer(ContentHashWritableMixin, serializers.ModelSerializer):
    conditions = ConditionSerializer(many=True, required=False)
    decision_table_node = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = ConditionGroup
        fields = "__all__"


class DecisionTableNodeSerializer(
    ContentHashWritableMixin, serializers.ModelSerializer
):
    condition_groups = ConditionGroupSerializer(many=True, required=False)

    class Meta:
        model = DecisionTableNode
        fields = "__all__"


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


class WebhookTriggerNodeSerializer(BaseGraphEntityMixin, serializers.ModelSerializer):
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
        python_code_data = validated_data.pop("python_code")
        webhook_trigger_data = validated_data.pop("webhook_trigger", None)
        wt_id = getattr(self, "_webhook_trigger_id", None)

        python_code = PythonCode.objects.create(**python_code_data)

        webhook_trigger_instance = None
        if wt_id:
            webhook_trigger_instance = WebhookTrigger.objects.filter(id=wt_id).first()
        elif webhook_trigger_data:
            path = webhook_trigger_data.get("path")
            ngrok_conf = webhook_trigger_data.get("ngrok_webhook_config")

            webhook_trigger_instance, created = WebhookTrigger.objects.get_or_create(
                path=path, ngrok_webhook_config=ngrok_conf
            )

        node = WebhookTriggerNode.objects.create(
            python_code=python_code,
            webhook_trigger=webhook_trigger_instance,
            **validated_data,
        )
        return node

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)
        if python_code_data:
            python_code = instance.python_code
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        wt_id = getattr(self, "_webhook_trigger_id", None)
        if wt_id:
            instance.webhook_trigger = WebhookTrigger.objects.filter(id=wt_id).first()
            validated_data.pop("webhook_trigger", None)
        elif "webhook_trigger" in validated_data:
            webhook_trigger_data = validated_data.pop("webhook_trigger")

            if webhook_trigger_data:
                path = webhook_trigger_data.get("path")
                ngrok_conf = webhook_trigger_data.get("ngrok_webhook_config")

                webhook_trigger_instance, created = (
                    WebhookTrigger.objects.get_or_create(
                        path=path, ngrok_webhook_config=ngrok_conf
                    )
                )
                instance.webhook_trigger = webhook_trigger_instance
            else:
                instance.webhook_trigger = None

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class GraphNoteSerializer(BaseGraphEntityMixin, serializers.ModelSerializer):
    class Meta(BaseGraphEntityMixin.Meta):
        model = GraphNote
        fields = "__all__"


class GraphSerializer(serializers.ModelSerializer):
    # Reverse relationships
    crew_node_list = CrewNodeSerializer(many=True, read_only=True)
    python_node_list = PythonNodeSerializer(many=True, read_only=True)
    file_extractor_node_list = FileExtractorNodeSerializer(many=True, read_only=True)
    audio_transcription_node_list = AudioTranscriptionNodeSerializer(
        many=True, read_only=True
    )
    edge_list = EdgeSerializer(many=True, read_only=True)
    conditional_edge_list = ConditionalEdgeSerializer(many=True, read_only=True)
    llm_node_list = LLMNodeSerializer(many=True, read_only=True)
    webhook_trigger_node_list = WebhookTriggerNodeSerializer(many=True, read_only=True)
    start_node_list = StartNodeSerializer(many=True, read_only=True)
    decision_table_node_list = DecisionTableNodeSerializer(many=True, read_only=True)
    subgraph_node_list = SubGraphNodeSerializer(many=True, read_only=True)
    code_agent_node_list = CodeAgentNodeSerializer(many=True, read_only=True)
    end_node_list = EndNodeSerializer(many=True, read_only=True, source="end_node")
    telegram_trigger_node_list = TelegramTriggerNodeSerializer(
        many=True, read_only=True
    )
    label_ids = serializers.PrimaryKeyRelatedField(
        many=True, source="labels", queryset=Label.objects.all(), required=False
    )
    graph_note_list = GraphNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Graph
        fields = [
            "id",
            "uuid",
            "name",
            "metadata",
            "description",
            "crew_node_list",
            "python_node_list",
            "file_extractor_node_list",
            "audio_transcription_node_list",
            "edge_list",
            "conditional_edge_list",
            "llm_node_list",
            "webhook_trigger_node_list",
            "decision_table_node_list",
            "subgraph_node_list",
            "code_agent_node_list",
            "start_node_list",
            "end_node_list",
            "time_to_live",
            "persistent_variables",
            "epicchat_enabled",
            "telegram_trigger_node_list",
            "label_ids",
            "graph_note_list",
        ]

    def create(self, validated_data):
        labels = validated_data.pop("labels", [])
        instance = super().create(validated_data)
        instance.labels.set(labels)
        return instance

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        instance = super().update(instance, validated_data)
        if labels is not None:
            instance.labels.set(labels)
        return instance

    def create(self, validated_data):
        labels = validated_data.pop("labels", [])
        instance = super().create(validated_data)
        instance.labels.set(labels)
        return instance

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        instance = super().update(instance, validated_data)
        if labels is not None:
            instance.labels.set(labels)
        return instance


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


class GraphOrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphOrganization
        fields = [
            "id",
            "graph",
            "organization",
            "persistent_variables",
            "user_variables",
        ]

    def validate(self, attrs):
        graph = attrs.get("graph") or getattr(self.instance, "graph", None)
        if not graph:
            raise serializers.ValidationError("Graph is required to validate variables")

        organization_variables = attrs.get("persistent_variables", {})
        user_variables = attrs.get("user_variables", {})

        qs = GraphOrganization.objects.filter(graph=graph)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError("This flow already has an organization")

        start_node: StartNode = graph.start_node_list.first()
        for key in user_variables:
            if key not in start_node.variables:
                raise serializers.ValidationError(
                    {
                        "user_variables": f"Provided user_variables have to be in flow domain. Variable `{key}` is not in domain."
                    }
                )
        for key in organization_variables:
            if key not in start_node.variables:
                raise serializers.ValidationError(
                    {
                        "persistent_variables": f"Provided persistent_variables have to be in flow domain. Variable `{key}` is not in domain."
                    }
                )
            if key in user_variables:
                raise serializers.ValidationError(
                    {
                        "user_variables": f"User variables and Organization variables cannot have same values. Issue with key `{key}`"
                    }
                )

        return super().validate(attrs)


class GraphOrganizationUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphOrganizationUser
        fields = ["id", "graph", "organization_user", "persistent_variables"]
        read_only_fields = ["id", "persistent_variables"]


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
