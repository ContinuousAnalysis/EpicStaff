from chunkers import (
    TokenChunker,
    CharacterChunker,
    MarkdownChunker,
    HTMLChunker,
    JSONChunker,
    CSVChunker,
    BaseChunker,
)

from .redis_service import RedisService
from models.enums import Status
from models.dto.models_dto import ChunkDTO, DocumentContentDTO, DocumentMetadataDTO
from models.orm.document_models import DocumentContent, DocumentMetadata
from settings import UnitOfWork
from utils.singleton_meta import SingletonMeta


class ChunkDocumentService(metaclass=SingletonMeta):
    
    def _get_chunk_strategy(
        self, chunk_strategy, chunk_size, chunk_overlap, additional_params
    ) -> BaseChunker:
        strategies = {
            "token": TokenChunker,
            "character": CharacterChunker,
            "markdown": MarkdownChunker,
            "html": HTMLChunker,
            "json": JSONChunker,
            "csv": CSVChunker,
        }
        return strategies[chunk_strategy](chunk_size, chunk_overlap, additional_params)

    def _get_text_content(self, binary_content) -> str:

        content = bytes(binary_content).decode("utf-8")
        return content

    def process_chunk_document_by_document_id(self, document_id: int):
        uow = UnitOfWork()
        with uow.start() as uow_ctx:
            document = uow_ctx.document_storage.get_document_by_document_id(
                document_id=document_id
            )

            if document is None:
                raise ValueError(f"Document with id {document_id} was not found")

        return self.proccess_chunk_document(document=document)

    def proccess_chunk_document(self, document: DocumentMetadataDTO) -> list[ChunkDTO]:

        doc_content: DocumentContentDTO = document.document_content
        chunk_list = self.perform_chunking(
            binary_content=doc_content.content,
            chunk_strategy=document.chunk_strategy,
            chunk_size=document.chunk_size,
            chunk_overlap=document.chunk_overlap,
            additional_params=document.additional_params,
        )
        uow = UnitOfWork()
        with uow.start() as uow_ctx:

            # Remove old chunks
            uow.chunk_storage.delete_chunks(document_id=document.document_id)
            # Remove old embeddings
            uow.knowledge_storage.delete_document_embeddings(
                document_id=document.document_id
            )

            # Save new chunks
            chunk_dto_list = uow_ctx.chunk_storage.save_document_chunks(
                document_metadata_id=document.document_id,
                chunk_list=chunk_list,
            )
            uow_ctx.document_storage.update_document_status(
                status=Status.CHUNKED, document_id=document.document_id
            )
            from .collection_processor_service import CollectionProcessorService

            CollectionProcessorService().process_collection_status(
                collection_id=document.source_collection_id
            )

        return chunk_dto_list

    def perform_chunking(
        self,
        binary_content: bytes,
        chunk_strategy: str,
        chunk_size: int,
        chunk_overlap: int,
        additional_params: dict,
    ) -> list:
        chunker = self._get_chunk_strategy(
            chunk_strategy=chunk_strategy,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            additional_params=additional_params,
        )
        text = self._get_text_content(binary_content)
        chunks = chunker.chunk(text)
        return chunks
