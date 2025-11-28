from pydantic import BaseModel


class KnowledgeSearchMessage(BaseModel):
    collection_id: int
    uuid: str
    query: str
    search_limit: int | None
    similarity_threshold: float | None


class ChunkDocumentMessage(BaseModel):
    naive_rag_document_id: int


class ChunkDocumentMessageResponse(BaseModel):
    naive_rag_document_id: int
    success: bool
    message: str | None = None
