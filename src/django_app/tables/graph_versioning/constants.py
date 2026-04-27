from tables.import_export.enums import EntityType
from tables.models import (
    Crew,
    Graph,
    LLMConfig,
    WebhookTrigger,
)

_GRAPH_SCALAR_FIELDS = (
    "name",
    "description",
    "metadata",
    "uuid",
    "time_to_live",
    "epicchat_enabled",
    "persistent_variables",
)

_DEPENDENCY_ENTITY_TYPES = {
    EntityType.CREW.value: EntityType.CREW,
    EntityType.LLM_CONFIG.value: EntityType.LLM_CONFIG,
    EntityType.WEBHOOK_TRIGGER.value: EntityType.WEBHOOK_TRIGGER,
    EntityType.GRAPH.value: EntityType.GRAPH,
}

_DEPENDENCY_MODELS = {
    EntityType.CREW.value: Crew,
    EntityType.LLM_CONFIG.value: LLMConfig,
    EntityType.WEBHOOK_TRIGGER.value: WebhookTrigger,
    EntityType.GRAPH.value: Graph,
}
