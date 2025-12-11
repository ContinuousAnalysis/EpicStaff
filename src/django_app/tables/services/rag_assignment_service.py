from django.core.exceptions import ValidationError
from django.db import transaction
from tables.models.knowledge_models.naive_rag_models import (
    NaiveRag,
    AgentNaiveRag,
    NaiveRagSearchConfig,
)
from tables.models.crew_models import Agent


class RagAssignmentService:

    @staticmethod
    def get_available_naive_rags_for_agent(agent: Agent):
        """
        Get all COMPLETED NaiveRags belonging to agent's knowledge_collection.
        Returns empty queryset if agent has no collection.
        """
        if not agent.knowledge_collection:
            return NaiveRag.objects.none()
        # validate status rag_status=NaiveRag.NaiveRagStatus.COMPLETED)
        return NaiveRag.objects.filter(
            base_rag_type__source_collection=agent.knowledge_collection
        ).select_related("base_rag_type", "embedder")

    @staticmethod
    @transaction.atomic
    def assign_naive_rag_to_agent(agent: Agent, naive_rag_id: int):
        """
        Create AgentNaiveRag link + NaiveRagSearchConfig with defaults.

        Raises:
        - NaiveRag.DoesNotExist if naive_rag_id invalid
        - ValidationError if RAG doesn't belong to agent's collection
        - IntegrityError if agent already has NaiveRag assigned (unique=True)
        """
        naive_rag = NaiveRag.objects.select_related(
            "base_rag_type__source_collection"
        ).get(naive_rag_id=naive_rag_id)

        # Validation: RAG must belong to agent's collection
        if naive_rag.base_rag_type.source_collection != agent.knowledge_collection:
            raise ValidationError(
                "Cannot assign NaiveRag: it doesn't belong to agent's knowledge collection"
            )

        RagAssignmentService.unassign_naive_rag_from_agent(agent)

        # Create M2M link
        AgentNaiveRag.objects.create(agent=agent, naive_rag=naive_rag)

        # Create search config with defaults (if doesn't exist)
        NaiveRagSearchConfig.objects.get_or_create(
            agent=agent, defaults={"search_limit": 3, "similarity_threshold": 0.2}
        )

        return naive_rag

    @staticmethod
    def get_agent_naive_rag(agent: Agent) -> NaiveRag | None:
        """Get currently assigned NaiveRag (or None)."""
        try:
            return agent.agent_naive_rags.select_related("naive_rag").get().naive_rag
        except AgentNaiveRag.DoesNotExist:
            return None

    @staticmethod
    @transaction.atomic
    def unassign_naive_rag_from_agent(agent: Agent):
        """Remove NaiveRag assignment (keeps search config)."""
        AgentNaiveRag.objects.filter(agent=agent).delete()


class SearchConfigService:

    @staticmethod
    def get_config_for_agent(agent: Agent) -> NaiveRagSearchConfig | None:
        """Get search config or None."""
        try:
            return agent.naive_search_config
        except NaiveRagSearchConfig.DoesNotExist:
            return None

    @staticmethod
    def update_search_config(
        agent: Agent, search_limit=None, similarity_threshold=None
    ):
        """
        Update agent's search config. Creates if doesn't exist.
        """
        config, created = NaiveRagSearchConfig.objects.get_or_create(
            agent=agent,
            defaults={
                "search_limit": search_limit or 3,
                "similarity_threshold": similarity_threshold or 0.2,
            },
        )

        if not created:
            if search_limit is not None:
                config.search_limit = search_limit
            if similarity_threshold is not None:
                config.similarity_threshold = similarity_threshold
            config.save()

        return config
