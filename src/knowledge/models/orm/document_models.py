from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    LargeBinary,
    JSON,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
import uuid
from datetime import datetime
from models.enums import *

Base = declarative_base()


class Provider(Base):
    __tablename__ = "tables_provider"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True, nullable=False)

    # Relationship: EmbeddingModel points to Provider
    embedding_models = relationship(
        "EmbeddingModel", back_populates="embedding_provider"
    )

    def __str__(self):
        return self.name


class EmbeddingModel(Base):
    __tablename__ = "tables_embeddingmodel"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    predefined = Column(Boolean, default=False)
    embedding_provider_id = Column(
        Integer, ForeignKey("tables_provider.id"), nullable=True
    )
    deployment = Column(Text, nullable=True)
    base_url = Column(Text, nullable=True)
    is_visible = Column(Boolean, default=True)

    # Relationship
    embedding_provider = relationship("Provider", back_populates="embedding_models")
    embedding_configs = relationship("EmbeddingConfig", back_populates="model")


class EmbeddingConfig(Base):
    __tablename__ = "tables_embeddingconfig"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("tables_embeddingmodel.id"), nullable=True)
    custom_name = Column(Text, unique=True, nullable=False)
    task_type = Column(
        String(255), nullable=False, default="retrieval_doc"
    )  # or EmbedderTask default
    api_key = Column(Text, nullable=True)
    is_visible = Column(Boolean, default=True)

    # Relationship
    model = relationship("EmbeddingModel", back_populates="embedding_configs")


class SourceCollection(Base):
    __tablename__ = "tables_sourcecollection"

    collection_id = Column(Integer, primary_key=True, autoincrement=True)
    collection_name = Column(String(255), nullable=True)
    user_id = Column(String(120), default="dummy_user", nullable=True)
    status = Column(String(20), default="new")  # You can use your Status enum here
    created_at = Column(DateTime, default=datetime.utcnow)

    # Foreign Key to EmbeddingConfig
    embedder_id = Column(
        Integer, ForeignKey("tables_embeddingconfig.id"), nullable=True
    )

    # Relationships
    embedder = relationship("EmbeddingConfig")
    document_metadata = relationship(
        "DocumentMetadata",
        back_populates="source_collection",
        cascade="all, delete-orphan",
    )
    embeddings_coll = relationship(
        "DocumentEmbedding", back_populates="collection", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "collection_name", name="unique_collection_name_per_user"
        ),
    )

    def __str__(self):
        return self.collection_name or "Unnamed Collection"


class DocumentContent(Base):
    __tablename__ = "tables_documentcontent"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(LargeBinary, comment="Binary file content (max 12MB)")

    # Relationships
    document_metadata = relationship(
        "DocumentMetadata", back_populates="document_content"
    )


class DocumentMetadata(Base):
    __tablename__ = "tables_documentmetadata"

    document_id = Column(Integer, primary_key=True, autoincrement=True)
    document_hash = Column(String(64), unique=True, nullable=False)
    file_name = Column(String(255), nullable=True)
    file_type = Column(String(10), nullable=True)
    chunk_strategy = Column(String(20), default=DocumentChunkStrategy.TOKEN)
    chunk_size = Column(Integer, default=1000)
    chunk_overlap = Column(Integer, default=150)
    additional_params = Column(JSON, default=dict)
    status = Column(String(20), default=DocumentStatus.NEW)

    # Foreign Keys
    source_collection_id = Column(
        Integer, ForeignKey("tables_sourcecollection.collection_id"), nullable=True
    )
    document_content_id = Column(
        Integer, ForeignKey("tables_documentcontent.id"), nullable=True
    )

    # Relationships
    source_collection = relationship(
        "SourceCollection", back_populates="document_metadata"
    )
    document_content = relationship(
        "DocumentContent", back_populates="document_metadata"
    )
    chunks = relationship(
        "Chunk", back_populates="document", cascade="all, delete-orphan"
    )
    embeddings_doc = relationship(
        "DocumentEmbedding", back_populates="document", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.file_name or "Unnamed Document"


class Chunk(Base):
    __tablename__ = "tables_chunk"

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(
        Integer, ForeignKey("tables_documentmetadata.document_id"), nullable=False
    )
    text = Column(Text, nullable=False)

    # Relationships
    document = relationship("DocumentMetadata", back_populates="chunks")

    embeddings_chunk = relationship(
        "DocumentEmbedding",
        back_populates="chunk",
        cascade="all, delete",
        passive_deletes=True,
    )


class DocumentEmbedding(Base):
    __tablename__ = "tables_documentembedding"

    embedding_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime, default=datetime.utcnow)

    collection_id = Column(
        Integer, ForeignKey("tables_sourcecollection.collection_id"), nullable=False
    )
    document_id = Column(
        Integer, ForeignKey("tables_documentmetadata.document_id"), nullable=False
    )
    chunk_id = Column(
        Integer, ForeignKey("tables_chunk.id", ondelete="SET NULL"), nullable=True
    )
    vector = Column(Vector(1536), nullable=True)

    # Relationships
    collection = relationship("SourceCollection", back_populates="embeddings_coll")
    document = relationship("DocumentMetadata", back_populates="embeddings_doc")
    chunk = relationship("Chunk", back_populates="embeddings_chunk")
