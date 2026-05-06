from rest_framework import serializers
from django.db import transaction

from tables.models.crew_models import Crew
from tables.serializers.model_serializers.crew_serializers import (
    CrewSerializer,
)
from tables.models.graph_models import (
    AudioTranscriptionNode,
    CodeAgentNode,
    Condition,
    ConditionGroup,
    ConditionalEdge,
    CrewNode,
    DecisionTableNode,
    Edge,
    EndNode,
    FileExtractorNode,
    Graph,
    GraphNote,
    GraphOrganization,
    GraphOrganizationUser,
    GraphSessionMessage,
    LLMNode,
    PythonNode,
    StartNode,
    SubGraphNode,
    WebhookTriggerNode,
)
from tables.models.label_models import Label
from tables.models.python_models import PythonCode
from tables.models.webhook_models import WebhookTrigger
from tables.serializers.base_serializer import (
    BaseGraphEntityMixin,
    ContentHashWritableMixin,
)
from tables.serializers.utils.mixins import NestedPythonCodeMixin
from tables.serializers.base_serializers import (
    WebhookTriggerNestedSerializer,
)
from tables.serializers.model_serializers.python_serializers import (
    PythonCodeSerializer,
)
from tables.serializers.model_serializers.llm_serializers import (
    LLMConfigSerializer,
)
from tables.serializers.model_serializers.tag_serializers import (
    GraphTagSerializer,
)
from tables.serializers.telegram_trigger_serializers import (
    TelegramTriggerNodeSerializer,
)
from tables.services.persistent_variables_service import (
    PersistentVariablesService,
)
from tables.constants.variables_constants import (
    DOMAIN_VARIABLES_KEY,
    DOMAIN_ORGANIZATION_KEY,
    DOMAIN_USER_KEY,
    DOMAIN_PERSISTENT_KEY,
)


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


class PythonNodeSerializer(
    ContentHashWritableMixin, NestedPythonCodeMixin, serializers.ModelSerializer
):
    python_code = PythonCodeSerializer()

    class Meta:
        model = PythonNode
        fields = "__all__"

    def create(self, validated_data):
        return self._create_with_python_code(self.Meta.model, validated_data)

    def update(self, instance, validated_data):
        self._update_python_code(instance, validated_data)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
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


class ConditionalEdgeSerializer(
    ContentHashWritableMixin, NestedPythonCodeMixin, serializers.ModelSerializer
):
    python_code = PythonCodeSerializer()

    class Meta(BaseGraphEntityMixin.Meta):
        model = ConditionalEdge
        fields = "__all__"

    def create(self, validated_data):
        return self._create_with_python_code(self.Meta.model, validated_data)

    def update(self, instance, validated_data):
        self._update_python_code(instance, validated_data)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
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
                raise serializers.ValidationError(
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


class GraphSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphSessionMessage
        fields = "__all__"


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
