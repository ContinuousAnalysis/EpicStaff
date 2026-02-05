from enum import StrEnum


class Status(StrEnum):
    """
    Statuses for DocumentMetadata and SourceCollection models
    """

    NEW = "new"
    CHUNKED = "chunked"
    PROCESSING = "processing"
    COMPLETED = "completed"
    WARNING = "warning"
    FAILED = "failed"


class SourceCollectionStatus(StrEnum):
    """Status of document in SourceCollection"""

    NEW = "new"
    PROCESSING = "processing"
    COMPLETED = "completed"
    WARNING = "warning"
    FAILED = "failed"


class DocumentFileType(StrEnum):
    PDF = "pdf"
    CSV = "csv"
    DOCX = "docx"
    TXT = "txt"
    JSON = "json"
    HTML = "html"
    MD = "md"


class DocumentChunkStrategy(StrEnum):
    """Chunk splitting strategy for document"""

    TOKEN = "token"
    CHAR = "character"
    MARKDOWN = "markdown"
    JSON = "json"
    HTML = "html"
    CSV = "csv"


class DocumentStatus(StrEnum):
    """Status of document in SourceCollection"""

    NEW = "new"
    CHUNKED = "chunked"
    PROCESSING = "processing"
    COMPLETED = "completed"
    WARNING = "warning"
    FAILED = "failed"


class EmbedderTask(StrEnum):
    """Task types for embedding models"""

    RETRIEVAL_DOC = "retrieval_doc"
    RETRIEVAL_QUERY = "retrieval_query"
    SEMANTIC_SIMILARITY = "semantic_similarity"
    CLASSIFICATION = "classification"
    CLUSTERING = "clustering"
