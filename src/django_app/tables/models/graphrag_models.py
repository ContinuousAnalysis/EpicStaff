from django.db import models
from .crew_models import Task


class GraphRagInputFileType(models.TextChoices):
    CSV = "csv", "CSV"
    TEXT = "text", "Text"
    JSON = "json", "JSON"


class GraphRagChunkStrategyType(models.TextChoices):
    TOKENS = "tokens", "Tokens"
    SENTENCE = "sentence", "Sentence"


class GraphRagInputConfig(models.Model):
    """Configuration section for Input."""

    file_type = models.CharField(
        max_length=10,
        choices=GraphRagInputFileType.choices,
        default=GraphRagInputFileType.TEXT,
        help_text="Input file type to use (csv, text, json).",
    )


class GraphRagChunkingConfig(models.Model):
    """Configuration section for document chunking."""

    size = models.PositiveIntegerField(default=1200, help_text="The chunk size to use.")

    overlap = models.PositiveIntegerField(
        default=100, help_text="The chunk overlap to use."
    )

    strategy = models.CharField(
        max_length=20,
        choices=GraphRagChunkStrategyType.choices,
        default=GraphRagChunkStrategyType.TOKENS,
        help_text="The chunking strategy to use (tokens or sentence).",
    )

    def __str__(self):
        return f"GraphRagChunking(size={self.size}, overlap={self.overlap}, strategy={self.strategy})"


class ExtractGraphConfig(models.Model):
    """Configuration section for entity extraction."""

    def default_entity_types():
        """Default entity extraction types."""
        return ["organization", "person", "geo", "event"]

    entity_types = models.JSONField(
        default=default_entity_types,
        help_text=(
            "The entity extraction types to use. "
            "Defaults to ['organization', 'person', 'geo', 'event']"
        ),
    )

    max_gleanings = models.PositiveIntegerField(
        default=1, help_text="The maximum number of entity gleanings to use."
    )

    def __str__(self):
        return f"ExtractGraph(max_gleanings={self.max_gleanings}, entities={len(self.entity_types)})"


class ClusterGraphConfig(models.Model):
    """Configuration section for graph clustering."""

    max_cluster_size = models.PositiveIntegerField(
        default=10, help_text="The maximum cluster size to use."
    )

    def __str__(self):
        return f"ClusterGraph(max_cluster_size={self.max_cluster_size})"


class GraphRagIndexConfig(models.Model):

    input = models.OneToOneField(
        GraphRagInputConfig,
        on_delete=models.CASCADE,
        related_name="graph_rag_config",
        help_text="The input configuration for this GraphRAG pipeline.",
    )
    chunks = models.OneToOneField(
        GraphRagChunkingConfig,
        on_delete=models.CASCADE,
        related_name="graph_rag_config",
        help_text="The chunking configuration to use.",
    )

    extract_graph = models.OneToOneField(
        ExtractGraphConfig,
        on_delete=models.CASCADE,
        related_name="graph_rag_config",
        help_text="The entity extraction configuration to use.",
    )

    cluster_graph = models.OneToOneField(
        ClusterGraphConfig,
        on_delete=models.CASCADE,
        related_name="graph_rag_config",
        help_text="The cluster graph configuration to use.",
    )



class TaskGraphRagSearchConfig(models.Model):
    """
    Container for all possible GraphRAG search configurations for a given Task.
    """

    task = models.OneToOneField(
        "Task",
        on_delete=models.CASCADE,
        related_name="graph_search_config",
        help_text="Search configuration container linked to a specific task.",
    )

    basic_config = models.ForeignKey(
        "GraphRagBasicSearchConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks_using_basic",
    )
    local_config = models.ForeignKey(
        "GraphRagLocalSearchConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks_using_local",
    )
    global_config = models.ForeignKey(
        "GraphRagGlobalSearchConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks_using_global",
    )
    drift_config = models.ForeignKey(
        "GraphRagDriftSearchConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks_using_drift",
    )


    def get_active_config(self):
        """
        Return the active search configuration instance based on the task's search_method.
        """
        mapping = {
            Task.SearchMethod.GR_BASIC: self.basic_config,
            Task.SearchMethod.GR_LOCAL: self.local_config,
            Task.SearchMethod.GR_GLOBAL: self.global_config,
            Task.SearchMethod.GR_DRIFT: self.drift_config,
        }
        return mapping.get(self.task.search_method)

    def __str__(self):
        return f"GraphRAG Search Config for Task {self.task_id}"


class GraphRagBasicSearchConfig(models.Model):
    """
    The default configuration section for Basic Search.
    """

    prompt = models.TextField(
        null=True,
        blank=True,
        help_text="The basic search prompt to use.",
        default=None,
    )

    k = models.IntegerField(
        default=10,
        help_text="The number of text units to include in search context.",
    )

    max_context_tokens = models.IntegerField(
        default=12000,
        help_text="The maximum tokens.",
    )

    def __str__(self):
        return f"GraphRagBasicSearchConfig({self.pk})"


class GraphRagLocalSearchConfig(models.Model):
    """
    The default configuration section for Local Search.
    """

    prompt = models.TextField(
        null=True,
        blank=True,
        help_text="The local search prompt to use.",
        default=None,
    )

    text_unit_prop = models.FloatField(
        default=0.5,
        help_text="The text unit proportion.",
    )

    community_prop = models.FloatField(
        default=0.15,
        help_text="The community proportion.",
    )

    conversation_history_max_turns = models.IntegerField(
        default=5,
        help_text="The conversation history maximum turns.",
    )

    top_k_entities = models.IntegerField(
        default=10,
        help_text="The top k mapped entities.",
    )

    top_k_relationships = models.IntegerField(
        default=10,
        help_text="The top k mapped relations.",
    )

    max_context_tokens = models.IntegerField(
        default=12000,
        help_text="The maximum tokens.",
    )

    def __str__(self):
        return f"GraphRagLocalSearchConfig({self.pk})"


class GraphRagGlobalSearchConfig(models.Model):
    """
    The default configuration section for Global Search.
    """

    map_prompt = models.TextField(
        null=True,
        blank=True,
        help_text="The global search mapper prompt to use.",
        default=None,
    )

    reduce_prompt = models.TextField(
        null=True,
        blank=True,
        help_text="The global search reducer prompt to use.",
        default=None,
    )

    knowledge_prompt = models.TextField(
        null=True,
        blank=True,
        help_text="The global search general prompt to use.",
        default=None,
    )

    max_context_tokens = models.IntegerField(
        default=12000,
        help_text="The maximum context size in tokens.",
    )

    data_max_tokens = models.IntegerField(
        default=12000,
        help_text="The data llm maximum tokens.",
    )

    map_max_length = models.IntegerField(
        default=1000,
        help_text="The map llm maximum response length in words.",
    )

    reduce_max_length = models.IntegerField(
        default=2000,
        help_text="The reduce llm maximum response length in words.",
    )

    dynamic_search_threshold = models.IntegerField(
        default=1,
        help_text="Rating threshold to include a community report.",
    )

    dynamic_search_keep_parent = models.BooleanField(
        default=False,
        help_text="Keep parent community if any of the child communities are relevant.",
    )

    dynamic_search_num_repeats = models.IntegerField(
        default=1,
        help_text="Number of times to rate the same community report.",
    )

    dynamic_search_use_summary = models.BooleanField(
        default=False,
        help_text="Use community summary instead of full_context.",
    )

    dynamic_search_max_level = models.IntegerField(
        default=2,
        help_text="The maximum level of community hierarchy to consider if none of the processed communities are relevant.",
    )

    def __str__(self):
        return f"GraphRagGlobalSearchConfig({self.pk})"


class GraphRagDriftSearchConfig(models.Model):
    """
    The default configuration section for Drift Search.
    """

    # Prompts
    prompt = models.TextField(
        null=True,
        blank=True,
        default=None,
        help_text="The drift search prompt to use.",
    )

    reduce_prompt = models.TextField(
        null=True,
        blank=True,
        default=None,
        help_text="The drift search reduce prompt to use.",
    )

    # Token configuration
    data_max_tokens = models.IntegerField(
        default=12000,
        help_text="The data llm maximum tokens.",
    )

    reduce_max_tokens = models.IntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="The reduce llm maximum tokens response to produce.",
    )

    reduce_temperature = models.FloatField(
        default=0.0,
        help_text="The temperature to use for token generation in reduce.",
    )

    reduce_max_completion_tokens = models.IntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="The reduce llm maximum tokens response to produce.",
    )

    # Execution settings
    concurrency = models.IntegerField(
        default=32,
        help_text="The number of concurrent requests.",
    )

    drift_k_followups = models.IntegerField(
        default=20,
        help_text="The number of top global results to retrieve.",
    )

    primer_folds = models.IntegerField(
        default=5,
        help_text="The number of folds for search priming.",
    )

    primer_llm_max_tokens = models.IntegerField(
        default=12000,
        help_text="The maximum number of tokens for the LLM in primer.",
    )

    n_depth = models.IntegerField(
        default=3,
        help_text="The number of drift search steps to take.",
    )

    # Local search tuning
    local_search_text_unit_prop = models.FloatField(
        default=0.9,
        help_text="The proportion of search dedicated to text units.",
    )

    local_search_community_prop = models.FloatField(
        default=0.1,
        help_text="The proportion of search dedicated to community properties.",
    )

    local_search_top_k_mapped_entities = models.IntegerField(
        default=10,
        help_text="The number of top K entities to map during local search.",
    )

    local_search_top_k_relationships = models.IntegerField(
        default=10,
        help_text="The number of top K relationships to map during local search.",
    )

    local_search_max_data_tokens = models.IntegerField(
        default=12000,
        help_text="The maximum context size in tokens for local search.",
    )

    local_search_temperature = models.FloatField(
        default=0.0,
        help_text="The temperature to use for token generation in local search.",
    )

    local_search_top_p = models.FloatField(
        default=1.0,
        help_text="The top-p value to use for token generation in local search.",
    )

    local_search_n = models.IntegerField(
        default=1,
        help_text="The number of completions to generate in local search.",
    )

    local_search_llm_max_gen_tokens = models.IntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="The maximum number of generated tokens for the LLM in local search.",
    )

    local_search_llm_max_gen_completion_tokens = models.IntegerField(
        null=True,
        blank=True,
        default=None,
        help_text="The maximum number of generated tokens for the LLM in local search.",
    )

    def __str__(self):
        return f"GraphRagDriftSearchConfig({self.pk})"
