from typing import List, Dict, Any, Optional
from django.db import transaction
from loguru import logger

from tables.models.knowledge_models import (
    SourceCollection,
    BaseRagType,
    NaiveRag,
    NaiveRagDocumentConfig,
    DocumentMetadata,
)
from tables.models.embedding_models import EmbeddingConfig
from tables.exceptions import (
    RagTypeNotFoundException,
    NaiveRagNotFoundException,
    DocumentConfigNotFoundException,
    EmbedderNotFoundException,
    InvalidChunkParametersException,
    DocumentsNotFoundException,
    CollectionNotFoundException,
)
from tables.constants.knowledge_constants import (
    MIN_CHUNK_SIZE,
    MAX_CHUNK_SIZE,
    MIN_CHUNK_OVERLAP,
    MAX_CHUNK_OVERLAP,
    UNIVERSAL_STRATEGIES,
    FILE_TYPE_SPECIFIC_STRATEGIES,
)


class NaiveRagService:
    """
    Service for NaiveRag operations.

    Handles:
    - Creating/updating NaiveRag configuration
    - Managing per-document configurations
    - Bulk operations
    """

    @staticmethod
    def get_allowed_strategies_for_file_type(file_type: str) -> set:
        specific = FILE_TYPE_SPECIFIC_STRATEGIES.get(file_type, set())
        return UNIVERSAL_STRATEGIES | specific

    @staticmethod
    def is_strategy_allowed_for_file_type(strategy: str, file_type: str) -> bool:

        allowed = NaiveRagService.get_allowed_strategies_for_file_type(file_type)
        return strategy in allowed

    @staticmethod
    def validate_chunk_parameters(
        chunk_size: int, chunk_overlap: int, chunk_strategy: str
    ) -> None:
        """
        Validate chunk parameters.

        Args:
            chunk_size: Size of chunks
            chunk_overlap: Overlap between chunks
            chunk_strategy: Strategy for chunking

        Raises:
            InvalidChunkParametersException: If parameters are invalid
        """
        errors = []

        if chunk_size < MIN_CHUNK_SIZE or chunk_size > MAX_CHUNK_SIZE:
            errors.append(
                f"chunk_size must be between {MIN_CHUNK_SIZE} and {MAX_CHUNK_SIZE}"
            )

        if chunk_overlap < MIN_CHUNK_OVERLAP or chunk_overlap > MAX_CHUNK_OVERLAP:
            errors.append(
                f"chunk_overlap must be between {MIN_CHUNK_OVERLAP} and {MAX_CHUNK_OVERLAP}"
            )

        if chunk_overlap >= chunk_size:
            errors.append("chunk_overlap must be less than chunk_size")

        valid_strategies = [
            choice[0] for choice in NaiveRagDocumentConfig.ChunkStrategy.choices
        ]
        if chunk_strategy not in valid_strategies:
            errors.append(
                f"chunk_strategy must be one of: {', '.join(valid_strategies)}"
            )

        if errors:
            raise InvalidChunkParametersException("; ".join(errors))

    @staticmethod
    def validate_strategy_for_file_type(
        chunk_strategy: str, file_type: str, file_name: str
    ) -> None:
        """
        Validate that chunk strategy is allowed for the file type.

        Business Rules:
        - token, character: Allowed for ALL file types
        - json: Only for JSON files
        - markdown: Only for MD files
        - html: Only for HTML files
        - csv: Only for CSV files
        """
        if not NaiveRagService.is_strategy_allowed_for_file_type(
            chunk_strategy, file_type
        ):
            allowed = NaiveRagService.get_allowed_strategies_for_file_type(file_type)
            raise InvalidChunkParametersException(
                f"Strategy '{chunk_strategy}' is not allowed for file type '{file_type}'. "
                f"File '{file_name}' can only use strategies: {', '.join(sorted(allowed))}"
            )

    @staticmethod
    def get_collection(collection_id: int) -> SourceCollection:
        """Get collection by ID."""
        try:
            return SourceCollection.objects.get(collection_id=collection_id)
        except SourceCollection.DoesNotExist:
            raise CollectionNotFoundException(collection_id)

    @staticmethod
    def get_embedder(embedder_id: int) -> EmbeddingConfig:
        """Get embedder by ID."""
        try:
            return EmbeddingConfig.objects.get(pk=embedder_id)
        except EmbeddingConfig.DoesNotExist:
            raise EmbedderNotFoundException(embedder_id)

    @staticmethod
    def get_naive_rag(naive_rag_id: int) -> NaiveRag:
        """Get NaiveRag by ID."""
        try:
            return NaiveRag.objects.select_related(
                "base_rag_type", "base_rag_type__source_collection", "embedder"
            ).get(naive_rag_id=naive_rag_id)
        except NaiveRag.DoesNotExist:
            raise NaiveRagNotFoundException(naive_rag_id)

    @staticmethod
    def get_or_none_naive_rag_by_collection(collection_id: int) -> Optional[NaiveRag]:
        """
        Get NaiveRag for a collection, or None if doesn't exist.
        """
        try:
            base_rag = BaseRagType.objects.get(
                source_collection_id=collection_id, rag_type=BaseRagType.RagType.NAIVE
            )
            return NaiveRag.objects.select_related("embedder").get(
                base_rag_type=base_rag
            )
        except (BaseRagType.DoesNotExist, NaiveRag.DoesNotExist):
            return None

    @staticmethod
    @transaction.atomic
    def create_or_update_naive_rag(collection_id: int, embedder_id: int) -> NaiveRag:
        """
        Create new NaiveRag or update existing one.
        Creates BaseRagType + NaiveRag in one transaction.

        Args:
            collection_id: ID of source collection
            embedder_id: ID of embedder to use

        Returns:
            NaiveRag instance (new or updated)
        """
        # Validate collection exists
        collection = NaiveRagService.get_collection(collection_id)

        # Validate embedder exists
        embedder = NaiveRagService.get_embedder(embedder_id)

        # Check if NaiveRag already exists for this collection
        existing_naive_rag = NaiveRagService.get_or_none_naive_rag_by_collection(
            collection_id
        )

        if existing_naive_rag:
            # Update existing NaiveRag
            existing_naive_rag.embedder = embedder
            existing_naive_rag.save(update_fields=["embedder", "updated_at"])

            logger.info(
                f"Updated NaiveRag {existing_naive_rag.naive_rag_id} "
                f"for collection {collection_id}"
            )

            return existing_naive_rag

        # Create new BaseRagType
        base_rag_type = BaseRagType.objects.create(
            source_collection=collection, rag_type=BaseRagType.RagType.NAIVE
        )

        # Create new NaiveRag
        naive_rag = NaiveRag.objects.create(
            base_rag_type=base_rag_type,
            embedder=embedder,
            rag_status=NaiveRag.NaiveRagStatus.NEW,
        )

        logger.info(
            f"Created NaiveRag {naive_rag.naive_rag_id} "
            f"for collection {collection_id}"
        )

        return naive_rag

    @staticmethod
    @transaction.atomic
    def create_document_config(
        naive_rag_id: int,
        document_id: int,
        chunk_size: int,
        chunk_overlap: int,
        chunk_strategy: str,
        additional_params: Optional[Dict[str, Any]] = None,
    ) -> NaiveRagDocumentConfig:
        """
        Create configuration for a single document.

        Args:
            naive_rag_id: ID of NaiveRag
            document_id: ID of document
            chunk_size: Size of chunks
            chunk_overlap: Overlap between chunks
            chunk_strategy: Chunking strategy
            additional_params: Additional strategy-specific params

        Returns:
            Created NaiveRagDocumentConfig
        """
        # Validate parameters
        NaiveRagService.validate_chunk_parameters(
            chunk_size, chunk_overlap, chunk_strategy
        )

        # Get NaiveRag
        naive_rag = NaiveRagService.get_naive_rag(naive_rag_id)

        # Get document and verify it belongs to same collection
        try:
            document = DocumentMetadata.objects.get(document_id=document_id)
        except DocumentMetadata.DoesNotExist:
            raise DocumentsNotFoundException([document_id])

        if (
            document.source_collection_id
            != naive_rag.base_rag_type.source_collection_id
        ):
            raise InvalidChunkParametersException(
                f"Document {document_id} does not belong to the same collection"
            )

        # Validate strategy for file type
        NaiveRagService.validate_strategy_for_file_type(
            chunk_strategy=chunk_strategy,
            file_type=document.file_type,
            file_name=document.file_name,
        )

        # Create or update config
        config, created = NaiveRagDocumentConfig.objects.update_or_create(
            naive_rag=naive_rag,
            document=document,
            defaults={
                "chunk_size": chunk_size,
                "chunk_overlap": chunk_overlap,
                "chunk_strategy": chunk_strategy,
                "additional_params": additional_params or {},
                "status": NaiveRagDocumentConfig.NaiveRagDocumentStatus.NEW,
            },
        )

        action = "Created" if created else "Updated"
        logger.info(
            f"{action} document config for document {document_id} "
            f"in NaiveRag {naive_rag_id}"
        )

        return config

    @staticmethod
    @transaction.atomic
    def bulk_create_document_configs(
        naive_rag_id: int,
        chunk_size: int,
        chunk_overlap: int,
        chunk_strategy: str,
        additional_params: Optional[Dict[str, Any]] = None,
        document_ids: Optional[List[int]] = None,
    ) -> List[NaiveRagDocumentConfig]:
        """
        Bulk create/update document configs.
        Applies same parameters to multiple documents.

        IMPORTANT: Validates that chunk_strategy is compatible with EACH document's file type.

        Args:
            naive_rag_id: ID of NaiveRag
            chunk_size: Size of chunks (applied to all)
            chunk_overlap: Overlap between chunks (applied to all)
            chunk_strategy: Chunking strategy (applied to all)
            additional_params: Additional params (applied to all)
            document_ids: Optional list of specific document IDs.
                         If None, applies to ALL documents in collection.

        Returns:
            List of created/updated configs

        Raises:
            InvalidChunkParametersException: If strategy not compatible with any document's file type
        """
        # Validate parameters
        NaiveRagService.validate_chunk_parameters(
            chunk_size, chunk_overlap, chunk_strategy
        )

        # Get NaiveRag
        naive_rag = NaiveRagService.get_naive_rag(naive_rag_id)
        collection_id = naive_rag.base_rag_type.source_collection_id

        # Get documents
        if document_ids:
            # Specific documents
            documents = DocumentMetadata.objects.filter(
                document_id__in=document_ids, source_collection_id=collection_id
            )

            found_ids = set(doc.document_id for doc in documents)
            missing_ids = set(document_ids) - found_ids

            if missing_ids:
                raise DocumentsNotFoundException(list(missing_ids))
        else:
            # All documents in collection
            documents = DocumentMetadata.objects.filter(
                source_collection_id=collection_id
            )

        if not documents.exists():
            logger.warning(
                f"No documents found for bulk config in collection {collection_id}"
            )
            return []

        # Validate strategy is compatible with ALL documents
        incompatible_docs = []
        for document in documents:
            if not NaiveRagService.is_strategy_allowed_for_file_type(
                chunk_strategy, document.file_type
            ):
                allowed = NaiveRagService.get_allowed_strategies_for_file_type(
                    document.file_type
                )
                incompatible_docs.append(
                    f"'{document.file_name}' ({document.file_type}) - allowed: {', '.join(sorted(allowed))}"
                )

        if incompatible_docs:
            raise InvalidChunkParametersException(
                f"Strategy '{chunk_strategy}' is not compatible with all documents. "
                f"Incompatible documents:\n"
                + "\n".join(f"  - {doc}" for doc in incompatible_docs)
            )

        # Create/update configs for all documents
        configs = []
        for document in documents:
            config, created = NaiveRagDocumentConfig.objects.update_or_create(
                naive_rag=naive_rag,
                document=document,
                defaults={
                    "chunk_size": chunk_size,
                    "chunk_overlap": chunk_overlap,
                    "chunk_strategy": chunk_strategy,
                    "additional_params": additional_params or {},
                    "status": NaiveRagDocumentConfig.NaiveRagDocumentStatus.NEW,
                },
            )
            configs.append(config)

        logger.info(
            f"Bulk configured {len(configs)} documents for NaiveRag {naive_rag_id}"
        )

        return configs

    @staticmethod
    @transaction.atomic
    def update_document_config(
        config_id: int,
        naive_rag_id: int,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        chunk_strategy: Optional[str] = None,
        additional_params: Optional[Dict[str, Any]] = None,
    ) -> NaiveRagDocumentConfig:
        """
        Update existing document config.
        Only updates provided fields.

        Args:
            config_id: ID of config to update
            naive_rag_id: ID of NaiveRag (for validation)
            chunk_size: New chunk size (optional)
            chunk_overlap: New overlap (optional)
            chunk_strategy: New strategy (optional)
            additional_params: New additional params (optional)

        Returns:
            Updated config

        Raises:
            DocumentConfigNotFoundException: If config not found or doesn't belong to naive_rag
        """
        try:
            config = NaiveRagDocumentConfig.objects.select_related("document", "naive_rag").get(
                naive_rag_document_id=config_id,
            )
        except NaiveRagDocumentConfig.DoesNotExist:
            raise DocumentConfigNotFoundException(config_id)

        # Validate config belongs to the specified naive_rag
        if config.naive_rag_id != naive_rag_id:
            raise DocumentConfigNotFoundException(
                f"Config {config_id} does not belong to NaiveRag {naive_rag_id}"
            )

        # Build update dict
        updates = {}

        if chunk_size is not None:
            updates["chunk_size"] = chunk_size

        if chunk_overlap is not None:
            updates["chunk_overlap"] = chunk_overlap

        if chunk_strategy is not None:
            updates["chunk_strategy"] = chunk_strategy

        if additional_params is not None:
            updates["additional_params"] = additional_params

        # Validate if chunk params are being updated
        final_chunk_size = updates.get("chunk_size", config.chunk_size)
        final_chunk_overlap = updates.get("chunk_overlap", config.chunk_overlap)
        final_chunk_strategy = updates.get("chunk_strategy", config.chunk_strategy)

        NaiveRagService.validate_chunk_parameters(
            final_chunk_size, final_chunk_overlap, final_chunk_strategy
        )

        # Validate strategy for file type if strategy is being changed
        if chunk_strategy is not None:
            NaiveRagService.validate_strategy_for_file_type(
                chunk_strategy=final_chunk_strategy,
                file_type=config.document.file_type,
                file_name=config.document.file_name,
            )

        # Apply updates
        for field, value in updates.items():
            setattr(config, field, value)

        config.save()

        logger.info(f"Updated document config {config_id}")

        return config

    @staticmethod
    def get_document_configs_for_naive_rag(
        naive_rag_id: int,
    ) -> List[NaiveRagDocumentConfig]:
        """
        Get all document configs for a NaiveRag.

        Args:
            naive_rag_id: ID of NaiveRag

        Returns:
            List of document configs
        """
        # Verify NaiveRag exists
        NaiveRagService.get_naive_rag(naive_rag_id)

        return list(
            NaiveRagDocumentConfig.objects.filter(naive_rag_id=naive_rag_id)
            .select_related("document")
            .order_by("document__file_name")
        )

    @staticmethod
    @transaction.atomic
    def delete_naive_rag(naive_rag_id: int) -> Dict[str, Any]:
        """
        Delete NaiveRag and its BaseRagType.
        Cascades to document configs.

        Args:
            naive_rag_id: ID of NaiveRag to delete

        Returns:
            dict with deletion info
        """
        naive_rag = NaiveRagService.get_naive_rag(naive_rag_id)
        base_rag_type = naive_rag.base_rag_type
        collection_id = base_rag_type.source_collection_id

        # Count configs before deletion
        config_count = NaiveRagDocumentConfig.objects.filter(
            naive_rag=naive_rag
        ).count()

        # Delete (cascades to configs)
        base_rag_type.delete()  # This will cascade to NaiveRag and configs

        logger.info(
            f"Deleted NaiveRag {naive_rag_id} for collection {collection_id} "
            f"with {config_count} document configs"
        )

        return {
            "naive_rag_id": naive_rag_id,
            "collection_id": collection_id,
            "deleted_config_count": config_count,
        }

    @staticmethod
    @transaction.atomic
    def init_document_configs(naive_rag_id: int) -> List[NaiveRagDocumentConfig]:
        """
        Initialize document configs with defaults for documents that don't have configs yet.

        Business Logic:
        - Get all documents in the collection (via NaiveRag)
        - Get document IDs that already have configs
        - Create configs with DEFAULT values only for NEW documents (without configs)
        - Existing configs remain unchanged

        Args:
            naive_rag_id: ID of NaiveRag

        Returns:
            List of newly created configs (empty list if all docs already configured)
        """
        from tables.constants.knowledge_constants import (
            DEFAULT_CHUNK_SIZE,
            DEFAULT_CHUNK_OVERLAP,
            DEFAULT_CHUNK_STRATEGY,
        )

        # Get NaiveRag and verify it exists
        naive_rag = NaiveRagService.get_naive_rag(naive_rag_id)
        collection_id = naive_rag.base_rag_type.source_collection_id

        # Get all documents in collection
        all_documents = DocumentMetadata.objects.filter(
            source_collection_id=collection_id
        )

        if not all_documents.exists():
            logger.info(
                f"No documents found in collection {collection_id} for NaiveRag {naive_rag_id}"
            )
            return []

        # Get document IDs that already have configs
        existing_config_doc_ids = set(
            NaiveRagDocumentConfig.objects.filter(naive_rag=naive_rag)
            .values_list("document_id", flat=True)
        )

        # Filter documents that need new configs
        documents_without_configs = all_documents.exclude(
            document_id__in=existing_config_doc_ids
        )

        if not documents_without_configs.exists():
            logger.info(
                f"All documents already configured for NaiveRag {naive_rag_id}"
            )
            return []

        # Create configs with defaults for new documents
        new_configs = []
        for document in documents_without_configs:
            # Validate strategy for file type
            if not NaiveRagService.is_strategy_allowed_for_file_type(
                DEFAULT_CHUNK_STRATEGY, document.file_type
            ):
                # Skip documents incompatible with default strategy
                logger.warning(
                    f"Skipping document {document.document_id} ({document.file_type}): "
                    f"incompatible with default strategy '{DEFAULT_CHUNK_STRATEGY}'"
                )
                continue

            config = NaiveRagDocumentConfig.objects.create(
                naive_rag=naive_rag,
                document=document,
                chunk_size=DEFAULT_CHUNK_SIZE,
                chunk_overlap=DEFAULT_CHUNK_OVERLAP,
                chunk_strategy=DEFAULT_CHUNK_STRATEGY,
                additional_params={},
                status=NaiveRagDocumentConfig.NaiveRagDocumentStatus.NEW,
            )
            new_configs.append(config)

        logger.info(
            f"Initialized {len(new_configs)} new document configs for NaiveRag {naive_rag_id}. "
            f"Existing configs unchanged: {len(existing_config_doc_ids)}"
        )

        return new_configs

    @staticmethod
    @transaction.atomic
    def bulk_update_document_configs(
        naive_rag_id: int,
        config_ids: List[int],
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        chunk_strategy: Optional[str] = None,
        additional_params: Optional[Dict[str, Any]] = None,
    ) -> List[NaiveRagDocumentConfig]:
        """
        Bulk update multiple document configs by their config IDs.
        Apply same parameters to all selected configs.

        Args:
            naive_rag_id: ID of NaiveRag (for validation)
            config_ids: List of config IDs to update
            chunk_size: New chunk size (optional)
            chunk_overlap: New overlap (optional)
            chunk_strategy: New strategy (optional)
            additional_params: New additional params (optional)

        Returns:
            List of updated configs

        Raises:
            DocumentConfigNotFoundException: If any config ID not found or doesn't belong to naive_rag
            InvalidChunkParametersException: If parameters invalid
        """
        if not config_ids:
            raise InvalidChunkParametersException("config_ids list cannot be empty")

        # Verify NaiveRag exists
        NaiveRagService.get_naive_rag(naive_rag_id)

        # Get all configs that belong to this naive_rag
        configs = list(
            NaiveRagDocumentConfig.objects.filter(
                naive_rag_id=naive_rag_id,
                naive_rag_document_id__in=config_ids
            ).select_related("document")
        )

        found_ids = {config.naive_rag_document_id for config in configs}
        missing_ids = set(config_ids) - found_ids

        if missing_ids:
            raise DocumentConfigNotFoundException(
                f"Configs not found or don't belong to NaiveRag {naive_rag_id}: {sorted(missing_ids)}"
            )

        # Build update dict
        updates = {}
        if chunk_size is not None:
            updates["chunk_size"] = chunk_size
        if chunk_overlap is not None:
            updates["chunk_overlap"] = chunk_overlap
        if chunk_strategy is not None:
            updates["chunk_strategy"] = chunk_strategy
        if additional_params is not None:
            updates["additional_params"] = additional_params

        if not updates:
            raise InvalidChunkParametersException(
                "At least one field must be provided for update"
            )

        # Determine final values for validation
        first_config = configs[0]
        final_chunk_size = updates.get("chunk_size", first_config.chunk_size)
        final_chunk_overlap = updates.get("chunk_overlap", first_config.chunk_overlap)
        final_chunk_strategy = updates.get("chunk_strategy", first_config.chunk_strategy)

        # Validate chunk parameters
        NaiveRagService.validate_chunk_parameters(
            final_chunk_size, final_chunk_overlap, final_chunk_strategy
        )

        # Validate strategy compatibility with all file types
        if chunk_strategy is not None:
            incompatible_docs = []
            for config in configs:
                if not NaiveRagService.is_strategy_allowed_for_file_type(
                    chunk_strategy, config.document.file_type
                ):
                    allowed = NaiveRagService.get_allowed_strategies_for_file_type(
                        config.document.file_type
                    )
                    incompatible_docs.append(
                        f"'{config.document.file_name}' ({config.document.file_type}) - allowed: {', '.join(sorted(allowed))}"
                    )

            if incompatible_docs:
                raise InvalidChunkParametersException(
                    f"Strategy '{chunk_strategy}' is not compatible with all selected configs. "
                    f"Incompatible documents:\n"
                    + "\n".join(f"  - {doc}" for doc in incompatible_docs)
                )

        # Apply updates to all configs
        for config in configs:
            for field, value in updates.items():
                setattr(config, field, value)
            config.save()

        logger.info(f"Bulk updated {len(configs)} document configs")

        return configs

    @staticmethod
    @transaction.atomic
    def bulk_delete_document_configs(naive_rag_id: int, config_ids: List[int]) -> Dict[str, Any]:
        """
        Bulk delete multiple document configs by their config IDs.

        Args:
            naive_rag_id: ID of NaiveRag (for validation)
            config_ids: List of config IDs to delete

        Returns:
            dict with deletion info

        Raises:
            InvalidChunkParametersException: If config_ids list is empty
            DocumentConfigNotFoundException: If any config not found or doesn't belong to naive_rag
        """
        if not config_ids:
            raise InvalidChunkParametersException("config_ids list cannot be empty")

        # Verify NaiveRag exists
        NaiveRagService.get_naive_rag(naive_rag_id)

        # Get configs that belong to this naive_rag
        configs = NaiveRagDocumentConfig.objects.filter(
            naive_rag_id=naive_rag_id,
            naive_rag_document_id__in=config_ids
        )

        found_ids = list(configs.values_list("naive_rag_document_id", flat=True))
        missing_ids = set(config_ids) - set(found_ids)

        if missing_ids:
            raise DocumentConfigNotFoundException(
                f"Configs not found or don't belong to NaiveRag {naive_rag_id}: {sorted(missing_ids)}"
            )

        deleted_count = len(found_ids)

        # Delete configs
        configs.delete()

        logger.info(f"Bulk deleted {deleted_count} document configs: {found_ids}")

        return {
            "deleted_count": deleted_count,
            "deleted_config_ids": found_ids,
        }

    @staticmethod
    @transaction.atomic
    def delete_document_config(config_id: int, naive_rag_id: int) -> Dict[str, Any]:
        """
        Delete a single document config.

        Args:
            config_id: ID of config to delete
            naive_rag_id: ID of NaiveRag (for validation)

        Returns:
            dict with deletion info

        Raises:
            DocumentConfigNotFoundException: If config not found or doesn't belong to naive_rag
        """
        try:
            config = NaiveRagDocumentConfig.objects.get(
                naive_rag_document_id=config_id,
            )
        except NaiveRagDocumentConfig.DoesNotExist:
            raise DocumentConfigNotFoundException(config_id)

        # Validate config belongs to the specified naive_rag
        if config.naive_rag_id != naive_rag_id:
            raise DocumentConfigNotFoundException(
                f"Config {config_id} does not belong to NaiveRag {naive_rag_id}"
            )

        document_name = config.document.file_name
        config.delete()

        logger.info(f"Deleted document config {config_id} for document '{document_name}'")

        return {
            "config_id": config_id,
            "document_name": document_name,
        }
