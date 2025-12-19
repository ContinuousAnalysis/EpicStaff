from pydantic import BaseModel
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field



# RAG Search Configuration Models
class BaseRagSearchConfig(BaseModel):
    """Base class for RAG-specific search parameters."""

    rag_type: str  # Discriminator field for polymorphism


class NaiveRagSearchConfig(BaseRagSearchConfig):
    """Search parameters specific to naive RAG implementation."""

    rag_type: Literal["naive"] = "naive"
    search_limit: int = 3
    similarity_threshold: float = 0.2


class GraphRagSearchConfig(BaseRagSearchConfig):
    """Search parameters specific to graph RAG implementation"""

    rag_type: Literal["graph"] = "graph"
    pass


RagSearchConfig = Annotated[
    Union[NaiveRagSearchConfig, GraphRagSearchConfig],
    Field(discriminator="rag_type"),
]


class BaseKnowledgeSearchMessage(BaseModel):
      """
      Base message for searching in a RAG implementation.

      Uses discriminated union for rag_search_config to automatically
      handle different RAG types (naive, graph, etc.) during serialization.
      """
      collection_id: int
      rag_id: int  # ID of specific RAG implementation (naive_rag_id, graph_rag_id, etc.)
      rag_type: str  # Type of RAG ("naive", "graph", etc.)
      uuid: str
      query: str
      rag_search_config: RagSearchConfig  # Discriminated union automatically handles subtypes


class ChunkDocumentMessage(BaseModel):
    """
    Message for chunking a document based on RAG-specific configuration.

    Updated: Uses naive_rag_document_config_id instead of document_id.
    Each RAG implementation can chunk the same document differently.
    """
    naive_rag_document_config_id: int


class ChunkDocumentMessageResponse(BaseModel):
    """Response message for document chunking."""
    naive_rag_document_config_id: int
    success: bool
    message: str | None = None


class ProcessRagIndexingMessage(BaseModel):
    """
    Message for triggering RAG indexing (chunking + embedding) for a specific RAG implementation.

    Fields:
    - rag_id: ID of the specific RAG implementation (naive_rag_id for NaiveRag, etc.)
    - rag_type: Type of RAG ("naive", "graph", etc.)
    - collection_id: Source collection ID (for logging)
    """
    rag_id: int
    rag_type: str  # "naive" or "graph"
    collection_id: int
