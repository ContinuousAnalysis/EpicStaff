from rag.rag_strategy_factory import RAGStrategyFactory
from rag.base_rag_strategy import BaseRAGStrategy
from settings import UnitOfWork
from utils.singleton_meta import SingletonMeta
from models.redis_models import BaseRagSearchConfig


class CollectionProcessorService(metaclass=SingletonMeta):
    """Context class that uses a RAG strategy."""

    def __init__(self):
        self.uow = UnitOfWork()

    def _get_strategy(self, rag_type: str) -> BaseRAGStrategy:
        return RAGStrategyFactory.get_strategy(rag_type)

    def process_rag_indexing(self, rag_id: int, rag_type: str):
        strategy = self._get_strategy(rag_type)
        strategy.process_rag_indexing(rag_id=rag_id)

    def search(
        self,
        rag_id: int,
        rag_type: str,
        uuid: str,
        query: str,
        rag_search_config: BaseRagSearchConfig,
    ):
        strategy = self._get_strategy(rag_type)
        return strategy.search(
            rag_id=rag_id, uuid=uuid, query=query, rag_search_config=rag_search_config
        )
