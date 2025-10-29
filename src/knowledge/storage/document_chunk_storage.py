from typing import List
from loguru import logger

from models.dto.models_dto import ChunkDTO
from .base_storage import BaseORMStorage
from models.orm.document_models import Chunk, DocumentMetadata
from sqlalchemy.orm import Session

class ORMDocumentChunkStorage(BaseORMStorage):

    def delete_chunks(self, document_id: int) -> bool:
        """Delete all chunks for a document by its document_id."""
        try:
            document = (
                self.session.query(DocumentMetadata)
                .filter(DocumentMetadata.document_id == document_id)
                .one_or_none()
            )

            if not document:
                logger.warning(f"Document with id {document_id} not found")
                return False

            # Delete all associated chunks (cascade already defined in model)
            self.session.query(Chunk).filter(
                Chunk.document_id == document.document_id
            ).delete()
            return True

        except Exception as e:
            logger.error(f"Failed to delete chunks for document {document_id}: {e}")
            return False

    def save_document_chunks(
        self, document_metadata_id: int, chunk_list: List[str]
    ) -> list[ChunkDTO]:
        """Save multiple chunks for a document."""
        try:
            chunks = [
                Chunk(document_id=document_metadata_id, text=chunk)
                for chunk in chunk_list
            ]
            self.session.add_all(chunks)
            self.session.flush()
            chunk_dto_list = [
                ChunkDTO(id=c.id, document_id=c.document_id, text=c.text)
                for c in chunks
            ]
            return chunk_dto_list

        except Exception as e:
            logger.error(
                f"Failed to save chunks for document {document_metadata_id}: {e}"
            )
            raise

    def delete_document_chunks(self, document_metadata_id: int) -> bool:
        """Delete all chunks for a document by its ID."""
        try:
            deleted = (
                self.session.query(Chunk)
                .filter(Chunk.document_id == document_metadata_id)
                .delete()
            )
            return deleted > 0
        except Exception as e:
            logger.error(
                f"Failed to delete chunks for document {document_metadata_id}: {e}"
            )
            return False
