from typing import List, Optional
from sqlalchemy.orm import selectinload

from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from models.dto.models_dto import DocumentMetadataDTO
from models.enums import DocumentChunkStrategy, Status
from .base_storage import BaseORMStorage
from models.orm.document_models import (
    DocumentMetadata,
    DocumentContent,
    SourceCollection,
    DocumentStatus,
)
from sqlalchemy.orm import joinedload
from sqlalchemy import func


class ORMDocumentStorage(BaseORMStorage):
    def get_documents_in_collection(
        self,
        collection_id: int,
        status: DocumentStatus | tuple[DocumentStatus] = DocumentStatus.NEW,
    ) -> list[DocumentMetadataDTO]:
        if isinstance(status, DocumentStatus):
            status = (status,)

        """Get all documents in a collection with specified status."""
        try:
            # Just filter on relationships, no need for explicit joins

            documents = (
                self.session.query(DocumentMetadata)
                .options(selectinload(DocumentMetadata.document_content))
                .filter(
                    DocumentMetadata.source_collection_id == collection_id,
                    DocumentMetadata.status.in_(status),
                )
                .all()
            )

            return [DocumentMetadataDTO.model_validate(doc) for doc in documents]

        except SQLAlchemyError as e:
            logger.error(
                f"Failed to get documents in collection {collection_id}: {str(e)}"
            )
            return []

    def get_documents_statuses(self, collection_id: int) -> List[Status]:
        """Get all document statuses for a given collection."""
        try:
            collection = (
                self.session.query(SourceCollection)
                .filter(SourceCollection.collection_id == collection_id)
                .first()
            )

            if not collection:
                return []

            # Access related documents directly
            return [Status(doc.status) for doc in collection.document_metadata]

        except SQLAlchemyError as e:
            logger.error(
                f"Failed to get document statuses in collection {collection_id}: {str(e)}"
            )
            return []

    def update_document_status(self, status: Status, document_id: int) -> bool:
        """Update document status."""
        try:
            document = self.session.get(DocumentMetadata, document_id)

            if not document:
                logger.warning(f"Document with ID {document_id} not found")
                return False

            document.status = status
            return True

        except SQLAlchemyError as e:
            logger.error(
                f"Failed to update document status for ID {document_id}: {str(e)}"
            )
            return False

    def get_document_by_document_id(
        self, document_id: int
    ) -> Optional[DocumentMetadataDTO]:
        """Get a document by its document_id."""
        try:
            document = (
                self.session.query(DocumentMetadata)
                .options(selectinload(DocumentMetadata.document_content))
                .filter(DocumentMetadata.document_id == document_id)
                .one_or_none()
            )

            return DocumentMetadataDTO.model_validate(document) if document else None

        except SQLAlchemyError as e:
            logger.error(
                f"Failed to get document by document_id {document_id}: {str(e)}"
            )
            return None

    def get_document_by_document_hash(
        self, document_hash: str
    ) -> Optional[DocumentMetadata]:
        """Get a document by its hash."""
        try:
            document = (
                self.session.query(DocumentMetadata)
                .options(joinedload(DocumentMetadata.document_content))  # eager load
                .filter(DocumentMetadata.document_hash == document_hash)
                .one_or_none()
            )

            return DocumentMetadataDTO.model_validate(document) if document else None

        except SQLAlchemyError as e:
            logger.error(f"Failed to get document by hash {document_hash}: {str(e)}")
            return None

    # Additional helper methods for common operations

    def create_document_with_content(
        self,
        document_hash: str,
        file_name: str,
        file_type: str,
        content: bytes,
        collection_id: int,
        chunk_strategy: str = DocumentChunkStrategy.TOKEN,
        chunk_size: int = 1000,
        chunk_overlap: int = 150,
        additional_params: dict = None,
    ) -> Optional[int]:
        """Create a new document with its content."""
        try:
            # Create document content
            doc_content = DocumentContent(content=content)
            self.session.add(doc_content)
            self.session.flush()  # Get the ID

            # Create document metadata
            doc_metadata = DocumentMetadata(
                document_hash=document_hash,
                file_name=file_name,
                file_type=file_type,
                chunk_strategy=chunk_strategy,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                additional_params=additional_params or {},
                source_collection_id=collection_id,
                document_content_id=doc_content.id,
            )
            self.session.add(doc_metadata)
            self.session.flush()

            return doc_metadata.document_id

        except SQLAlchemyError as e:
            logger.error(f"Failed to create document: {str(e)}")
            return None

    def delete_document(self, document_id: int) -> bool:
        """Delete a document and its content."""
        try:
            document = (
                self.session.query(DocumentMetadata)
                .filter(DocumentMetadata.document_id == document_id)
                .first()
            )

            if not document:
                logger.warning(f"Document with ID {document_id} not found")
                return False

            # Delete associated content if exists
            if document.document_content:
                self.session.delete(document.document_content)

            self.session.delete(document)
            return True

        except SQLAlchemyError as e:
            logger.error(f"Failed to delete document {document_id}: {str(e)}")
            return False

    def count_documents_by_status(self, collection_id: int) -> dict[Status, int]:
        """Count documents by status for a collection."""
        try:
            counts = (
                self.session.query(
                    DocumentMetadata.status,
                    func.count(DocumentMetadata.document_id),
                )
                .join(
                    SourceCollection,
                    DocumentMetadata.source_collection_id
                    == SourceCollection.collection_id,
                )
                .filter(SourceCollection.collection_id == collection_id)
                .group_by(DocumentMetadata.status)
                .all()
            )

            # Map string statuses to your StrEnum
            return {Status(status): count for status, count in counts}

        except SQLAlchemyError as e:
            logger.error(
                f"Failed to count documents by status for collection {collection_id}: {str(e)}"
            )
            return {}
