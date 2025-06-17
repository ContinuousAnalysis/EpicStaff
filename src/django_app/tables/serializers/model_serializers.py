from typing import Any, Literal
from decimal import Decimal

from tables.models import (
    Agent,
    Task,
    TaskContext,
    TaskTools,
    TemplateAgent,
    Tool,
    ToolConfigField,
)
from tables.models import LLMConfig
from tables.models import EmbeddingConfig
from tables.models import EmbeddingModel
from tables.models import LLMModel
from tables.models import Provider
from tables.models import Crew
from tables.models import (
    ConditionalEdge,
    CrewNode,
    Edge,
    Graph,
    GraphSessionMessage,
    PythonNode,
)
from rest_framework import serializers
from tables.exceptions import ToolConfigSerializerError
from tables.models import PythonCode, PythonCodeResult, PythonCodeTool
from tables.models.crew_models import (
    DefaultAgentConfig,
    DefaultCrewConfig,
    TaskPythonCodeTools,
)
from tables.models.embedding_models import DefaultEmbeddingConfig
from tables.models.graph_models import LLMNode, StartNode
from tables.models.llm_models import (
    DefaultLLMConfig,
    RealtimeModel,
    RealtimeConfig,
    RealtimeTranscriptionModel,
    RealtimeTranscriptionConfig,
)
from tables.models.realtime_models import (
    RealtimeSessionItem,
    RealtimeAgent,
    RealtimeAgentChat,
)
from tables.models.tag_models import AgentTag, CrewTag, GraphTag
from tables.models.vector_models import MemoryDatabase
from tables.validators import ToolConfigValidator, eval_any
from tables.models import (
    AgentSessionMessage,
    TaskSessionMessage,
    Session,
    UserSessionMessage,
)
from tables.models import (
    ToolConfig,
)

from django.core.exceptions import ValidationError


class LLMConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMConfig
        fields = "__all__"


class DefaultLLMConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultLLMConfig
        fields = "__all__"


class DefaultAgentConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultAgentConfig
        fields = "__all__"


class DefaultCrewConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultCrewConfig
        fields = "__all__"


class ProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Provider
        fields = "__all__"


class LLMModelSerializer(serializers.ModelSerializer):

    class Meta:
        model = LLMModel
        fields = "__all__"


class EmbeddingModelSerializer(serializers.ModelSerializer):

    class Meta:
        model = EmbeddingModel
        fields = "__all__"


class EmbeddingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmbeddingConfig
        fields = "__all__"


class DefaultEmbeddingConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DefaultEmbeddingConfig
        fields = [
            "model",
            "task_type",
            "api_key",
        ]


class ToolConfigFieldSerializer(serializers.ModelSerializer):

    class Meta:
        model = ToolConfigField
        fields = ["name", "description", "data_type", "required"]


class ToolSerializer(serializers.ModelSerializer):
    tool_fields = ToolConfigFieldSerializer(many=True, read_only=True)

    class Meta:
        model = Tool
        fields = ["id", "name", "name_alias", "description", "enabled", "tool_fields"]
        read_only_fields = ["id", "name", "name_alias", "description", "tool_fields"]


class PythonCodeSerializer(serializers.ModelSerializer):
    libraries = serializers.ListField(
        child=serializers.CharField(),
        write_only=False,
        help_text="A list of library names.",
    )

    class Meta:
        model = PythonCode
        fields = "__all__"

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
        libraries = data.get("libraries", [])
        if isinstance(libraries, list):
            internal_value["libraries"] = " ".join(libraries)
        return internal_value


class PythonCodeToolSerializer(serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta:
        model = PythonCodeTool
        fields = "__all__"

    def create(self, validated_data):
        python_code_data = validated_data.pop("python_code")
        python_code = PythonCode.objects.create(**python_code_data)
        python_code_tool = PythonCodeTool.objects.create(
            python_code=python_code, **validated_data
        )
        return python_code_tool

    def update(self, instance, validated_data):
        python_code_data = validated_data.pop("python_code", None)

        # Update nested PythonCode instance if provided
        if python_code_data:
            python_code = instance.python_code
            for attr, value in python_code_data.items():
                setattr(python_code, attr, value)
            python_code.save()

        # Update PythonCodeTool fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance

    def partial_update(self, instance, validated_data):
        # Delegate to the update method for consistency
        return self.update(instance, validated_data)


class RealtimeAgentSerializer(serializers.ModelSerializer):

    distance_threshold = serializers.DecimalField(
        max_digits=3,
        decimal_places=2,
        min_value=Decimal("0.00"),
        max_value=Decimal("1.00"),
        required=False,
    )

    search_limit = serializers.IntegerField(min_value=1, max_value=1000, required=False)

    class Meta:
        model = RealtimeAgent
        exclude = ["agent"]


class AgentSerializer(serializers.ModelSerializer):
    llm_config = serializers.PrimaryKeyRelatedField(
        queryset=LLMConfig.objects.all(),
        required=False,
        allow_null=True,
    )
    configured_tools = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=ToolConfig.objects.all(),
        required=False,
    )
    python_code_tools = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=PythonCodeTool.objects.all(),
        required=False,
    )
    realtime_agent = RealtimeAgentSerializer(required=False)

    class Meta:
        model = Agent
        fields = [
            "id",
            "role",
            "goal",
            "backstory",
            "configured_tools",
            "python_code_tools",
            "max_iter",
            "max_rpm",
            "max_execution_time",
            "memory",
            "allow_delegation",
            "cache",
            "allow_code_execution",
            "max_retry_limit",
            "respect_context_window",
            "default_temperature",
            "llm_config",
            "fcm_llm_config",
            "python_code_tools",
            "knowledge_collection",
            "realtime_agent",
        ]

    def create(self, validated_data):
        realtime_agent_data = validated_data.pop("realtime_agent", None)

        agent = super().create(validated_data)
        if not realtime_agent_data:
            RealtimeAgent.objects.create(agent=agent)
        else:
            RealtimeAgent.objects.create(agent=agent, **realtime_agent_data)

        return agent

    def update(self, instance, validated_data):
        realtime_agent_data = validated_data.pop("realtime_agent", None)

        instance = super().update(instance, validated_data)

        if realtime_agent_data:
            realtime_agent, created = RealtimeAgent.objects.get_or_create(
                agent=instance
            )
            for attr, value in realtime_agent_data.items():
                setattr(realtime_agent, attr, value)
            realtime_agent.save()

        return instance


class TemplateAgentSerializer(serializers.ModelSerializer):
    configured_tools = serializers.PrimaryKeyRelatedField(
        many=True, queryset=ToolConfig.objects.all()
    )

    class Meta:
        model = TemplateAgent
        fields = "__all__"


class TaskSerializer(serializers.ModelSerializer):
    task_context_list = serializers.PrimaryKeyRelatedField(
        many=True, queryset=TaskContext.objects.all(), required=False
    )
    task_tool_list = serializers.PrimaryKeyRelatedField(
        many=True, queryset=TaskTools.objects.all(), required=False
    )
    task_python_code_tool_list = serializers.PrimaryKeyRelatedField(
        many=True, queryset=TaskPythonCodeTools.objects.all(), required=False
    )

    class Meta:
        model = Task

        fields = "__all__"


class CrewSerializer(serializers.ModelSerializer):
    tasks = serializers.PrimaryKeyRelatedField(
        many=True, read_only=True, source="task_set"
    )
    manager_llm_config = serializers.PrimaryKeyRelatedField(
        queryset=LLMConfig.objects.all(),
        required=False,
        allow_null=True,
    )
    embedding_config = serializers.PrimaryKeyRelatedField(
        queryset=EmbeddingConfig.objects.all(),
        required=False,
        allow_null=True,
    )
    agents = serializers.PrimaryKeyRelatedField(
        queryset=Agent.objects.all(),
        many=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Crew
        fields = "__all__"

    # def validate(self, data):
    #     default_config = DefaultCrewConfig.load()
    #     # TODO: what is happening
    #     default_fields = ["manager_llm_config", "process", "memory", "embedding_config"]

    #     for field in default_fields:
    #         if data.get(field) is None:
    #             data[field] = getattr(default_config, field)

    #     return data


class ToolConfigSerializer(serializers.ModelSerializer):

    def __init__(
        self, *args, tool_config_validator: ToolConfigValidator | None = None, **kwargs
    ):
        super().__init__(*args, **kwargs)
        self.tool_config_validator = tool_config_validator or ToolConfigValidator(
            validate_null_fields=False, validate_missing_reqired_fields=False
        )

    class Meta:
        model = ToolConfig
        fields = "__all__"

    def validate(self, data: dict):

        name: str = data.get("name")
        tool: Tool = data.get("tool")
        configuration: dict = data.get("configuration", dict())

        if name is None:
            raise ToolConfigSerializerError("Name for configuration is not provided.")
        if tool is None:
            raise ToolConfigSerializerError("Tool is not provided.")
        if configuration is None:
            raise ToolConfigSerializerError("Configuration is not provided.")
        try:
            self.tool_config_validator.validate(
                name=name,
                tool=tool,
                configuration=configuration,
            )
        except ValidationError as e:
            raise ToolConfigSerializerError(e.message)

        return data

    # TODO: get rid of format parameter. Should use one as  pydantic.
    # using in: convert_configured_tool_to_pydantic()
    def to_representation(
        self, instance: ToolConfig, format: Literal["rest", "pydantic"] = "rest"
    ) -> dict:

        data = super().to_representation(instance)
        configuration: dict = data["configuration"]

        for key, value in configuration.items():
            tool_config_field: ToolConfigField = instance.get_tool_config_field(key)
            if tool_config_field.data_type == ToolConfigField.FieldType.ANY:

                # Get rid of ternar operator. Use only value["decoded_value"] (as pydantic)
                value = (
                    value["user_input"] if format == "rest" else value["decoded_value"]
                )

                configuration[key] = value

        # Creation bool field about passing validation.
        tool_id = data.get("tool", None)

        data["is_completed"] = self.tool_config_validator.validate_is_completed(
            tool_id, configuration
        )
        return data

    def to_internal_value(self, data: dict) -> dict:

        try:
            tool: Tool = Tool.objects.get(pk=data.get("tool"))
        except Tool.DoesNotExist:
            raise ToolConfigSerializerError(
                f"Tool with id: '{data.get("tool")}' does not exist", status_code=404
            )
        configuration: dict = data.get("configuration", dict())

        tool_config_fields = tool.get_tool_config_fields()

        for key, value in configuration.items():
            if key not in tool_config_fields:
                raise ToolConfigSerializerError(
                    f"Tool with id: '{tool.pk}' does not support field '{key}'. Available configuration fields: {[field for field in tool_config_fields.keys()]}",
                    status_code=404,
                )
            field = tool_config_fields.get(key)
            if field.data_type == ToolConfigField.FieldType.ANY:
                decoded_value = eval_any(key, value)

                # Problem with storring multivalued field in DB.
                # Potential solution: get rid of "user_input" and
                # dynamicaly calculate it from "decoded_value" if needed
                configuration[key] = {
                    "user_input": value,
                    "decoded_value": decoded_value,
                }

        data["configuration"] = configuration

        tool_config = super().to_internal_value(data)

        return tool_config


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


class CrewNodeSerializer(serializers.ModelSerializer):
    crew = CrewSerializer(read_only=True)
    crew_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = CrewNode
        fields = "__all__"
        read_only_fields = ["crew"]

    def get_crew(self, obj):
        return CrewSerializer(obj.crew).data if obj.crew else None

    def validate_crew_id(self, value):
        if not Crew.objects.filter(id=value).exists():
            raise serializers.ValidationError("Invalid crew_id: crew does not exist.")
        return value

    def update(self, instance, validated_data):
        if "crew_id" in validated_data:
            instance.crew_id = validated_data["crew_id"]
        return super().update(instance, validated_data)


class PythonNodeSerializer(serializers.ModelSerializer):
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


class LLMNodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMNode
        fields = "__all__"


class EdgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Edge
        fields = "__all__"


class ConditionalEdgeSerializer(serializers.ModelSerializer):
    python_code = PythonCodeSerializer()

    class Meta:
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


class GraphSerializer(serializers.ModelSerializer):
    # Reverse relationships
    crew_node_list = CrewNodeSerializer(many=True, read_only=True)
    python_node_list = PythonNodeSerializer(many=True, read_only=True)
    edge_list = EdgeSerializer(many=True, read_only=True)
    conditional_edge_list = ConditionalEdgeSerializer(many=True, read_only=True)
    llm_node_list = LLMNodeSerializer(many=True, read_only=True)

    class Meta:
        model = Graph
        fields = [
            "id",
            "name",
            "metadata",
            "description",
            "crew_node_list",
            "python_node_list",
            "edge_list",
            "conditional_edge_list",
            "llm_node_list",
        ]


class SessionSerializer(serializers.ModelSerializer):
    graph = GraphSerializer(many=False, read_only=True)

    class Meta:
        model = Session
        fields = "__all__"
        read_only_fields = [
            "id",
            "status",
            "initial_state",
            "created_at",
            "finished_at",
            "graph",
            "graph_schema",
        ]


class GraphSessionMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphSessionMessage
        fields = "__all__"


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoryDatabase
        fields = ["id", "payload"]


class CrewTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrewTag
        fields = "__all__"


class AgentTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentTag
        fields = "__all__"


class GraphTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = GraphTag
        fields = "__all__"


class RealtimeModelSerializer(serializers.ModelSerializer):

    class Meta:
        model = RealtimeModel
        fields = "__all__"


class RealtimeConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeConfig
        fields = "__all__"


class RealtimeTranscriptionModelSerializer(serializers.ModelSerializer):

    class Meta:
        model = RealtimeTranscriptionModel
        fields = "__all__"


class RealtimeTranscriptionConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeTranscriptionConfig
        fields = "__all__"


class RealtimeSessionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeSessionItem
        fields = "__all__"


class RealtimeAgentChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeAgentChat
        fields = "__all__"


class StartNodeSerializer(serializers.ModelSerializer):
    node_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StartNode
        fields = ["id", "graph", "variables", "node_name"]
        read_only_fields = ["node_name"]

    def get_node_name(self, obj):
        return "__start__"
