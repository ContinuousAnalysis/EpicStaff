from abc import ABC, abstractmethod


class BaseRAGStrategy(ABC):
    """
    Base interface for all RAG strategies.

    All RAG-specific strategies (NaiveRAGStrategy, GraphRAGStrategy, etc.)
    inherit from this base class and implement RAG-specific operations.

    Key Change: All methods now work with rag_id (NOT collection_id).
    """

    @abstractmethod
    def process_rag_indexing(self, rag_id: int, collection_id: int):
        """
        Perform indexing / embedding for a RAG implementation.

        Args:
            rag_id: ID of the specific RAG implementation (naive_rag_id, graph_rag_id, etc.)
            collection_id: ID of the source collection (for getting documents)

        Note: rag_id is RAG-specific (naive_rag_id for NaiveRag, graph_rag_id for GraphRag).
        """
        pass

    @abstractmethod
    def search(self, rag_id: int, uuid: str, query: str, **kwargs):
        """
        Perform search for a RAG implementation.

        Args:
            rag_id: ID of the specific RAG implementation (naive_rag_id, graph_rag_id, etc.)
            uuid: Request UUID
            query: Search query
            **kwargs: Additional search parameters (search_limit, similarity_threshold, etc.)

        Returns:
            Dict with search results

        Note: rag_id is RAG-specific (naive_rag_id for NaiveRag, graph_rag_id for GraphRag).
        """
        pass

    # Optional shared behavior
    def get_embedder(self, rag_id: int):
        """
        Return an embedder if strategy uses one.

        Args:
            rag_id: ID of the specific RAG implementation

        Raises:
            NotImplementedError: If strategy doesn't use embeddings
        """
        raise NotImplementedError("This strategy does not use embeddings.")

    def get_llm(self):
        """
        Return LLM model if needed (GraphRAG, AgentRAG, etc.).

        Raises:
            NotImplementedError: If strategy doesn't use an LLM
        """
        raise NotImplementedError("This strategy does not use an LLM.")
