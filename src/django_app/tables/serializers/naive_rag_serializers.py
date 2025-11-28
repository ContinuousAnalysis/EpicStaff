from rest_framework import serializers
from tables.models.knowledge_models import (
    BaseRagType,
    NaiveRag,
    NaiveRagDocumentConfig,
    NaiveRagChunk,
    DocumentMetadata,
)
from tables.models.embedding_models import EmbeddingConfig


class BaseRagTypeSerializer(serializers.ModelSerializer):
    """Serializer for BaseRagType."""
    
    class Meta:
        model = BaseRagType
        fields = [
            "rag_type_id",
            "rag_type",
            "source_collection",
            "error_message",
            "created_at",
            "updated_at",
            "processed_at",
        ]
        read_only_fields = fields


class NaiveRagSerializer(serializers.ModelSerializer):
    """
    Serializer for NaiveRag details.
    Used for displaying NaiveRag information.
    """
    base_rag_type = BaseRagTypeSerializer(read_only=True)
    embedder_name = serializers.CharField(
        source='embedder.name',
        read_only=True
    )
    collection_id = serializers.IntegerField(
        source='base_rag_type.source_collection_id',
        read_only=True
    )
    
    class Meta:
        model = NaiveRag
        fields = [
            "naive_rag_id",
            "base_rag_type",
            "embedder",
            "embedder_name",
            "rag_status",
            "collection_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class NaiveRagCreateUpdateSerializer(serializers.Serializer):
    """
    Serializer for creating/updating NaiveRag.
    """
    embedder_id = serializers.IntegerField(
        required=True,
        help_text="ID of the embedder to use"
    )
    
    def validate_embedder_id(self, value):
        """Validate embedder_id is positive."""
        if value <= 0:
            raise serializers.ValidationError("embedder_id must be positive")
        return value


class DocumentConfigSerializer(serializers.ModelSerializer):
    """
    Serializer for displaying document configuration.
    """
    document_id = serializers.IntegerField(source='document.document_id', read_only=True)
    file_name = serializers.CharField(source='document.file_name', read_only=True)
    
    class Meta:
        model = NaiveRagDocumentConfig
        fields = [
            "naive_rag_document_id",
            "document_id",
            "file_name",
            "chunk_strategy",
            "chunk_size",
            "chunk_overlap",
            "additional_params",
            "status",
            "total_chunks",
            "total_embeddings",
            "created_at",
            "processed_at",
        ]
        read_only_fields = fields


class DocumentConfigCreateSerializer(serializers.Serializer):
    """
    Serializer for creating single document config.
    """
    document_id = serializers.IntegerField(
        required=True,
        help_text="ID of the document to configure"
    )
    chunk_size = serializers.IntegerField(
        required=True,
        help_text="Size of each chunk"
    )
    chunk_overlap = serializers.IntegerField(
        required=True,
        help_text="Overlap between chunks"
    )
    chunk_strategy = serializers.ChoiceField(
        required=True,
        choices=NaiveRagDocumentConfig.ChunkStrategy.choices,
        help_text="Chunking strategy"
    )
    additional_params = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Additional strategy-specific parameters"
    )


class DocumentConfigBulkCreateSerializer(serializers.Serializer):
    """
    Serializer for bulk creating document configs.
    """
    chunk_size = serializers.IntegerField(
        required=True,
        help_text="Size of each chunk (applied to all documents)"
    )
    chunk_overlap = serializers.IntegerField(
        required=True,
        help_text="Overlap between chunks (applied to all documents)"
    )
    chunk_strategy = serializers.ChoiceField(
        required=True,
        choices=NaiveRagDocumentConfig.ChunkStrategy.choices,
        help_text="Chunking strategy (applied to all documents)"
    )
    additional_params = serializers.JSONField(
        required=False,
        default=dict,
        help_text="Additional parameters (applied to all documents)"
    )
    document_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        help_text="Optional: Specific document IDs. If empty, applies to ALL documents in collection"
    )


class DocumentConfigUpdateSerializer(serializers.Serializer):
    """
    Serializer for updating document config.
    All fields optional - only updates provided fields.
    """
    chunk_size = serializers.IntegerField(
        required=False,
        help_text="New chunk size"
    )
    chunk_overlap = serializers.IntegerField(
        required=False,
        help_text="New chunk overlap"
    )
    chunk_strategy = serializers.ChoiceField(
        required=False,
        choices=NaiveRagDocumentConfig.ChunkStrategy.choices,
        help_text="New chunking strategy"
    )
    additional_params = serializers.JSONField(
        required=False,
        help_text="New additional parameters"
    )
    
    def validate(self, attrs):
        """Ensure at least one field is provided."""
        if not attrs:
            raise serializers.ValidationError(
                "At least one field must be provided for update"
            )
        return attrs


class NaiveRagDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for NaiveRag with document configs.
    """
    base_rag_type = BaseRagTypeSerializer(read_only=True)
    embedder_name = serializers.CharField(
        source='embedder.name',
        read_only=True
    )
    collection_id = serializers.IntegerField(
        source='base_rag_type.source_collection_id',
        read_only=True
    )
    collection_name = serializers.CharField(
        source='base_rag_type.source_collection.collection_name',
        read_only=True
    )
    document_configs = DocumentConfigSerializer(
        source='naive_rag_configs',
        many=True,
        read_only=True
    )
    total_documents = serializers.SerializerMethodField()
    configured_documents = serializers.SerializerMethodField()
    
    class Meta:
        model = NaiveRag
        fields = [
            "naive_rag_id",
            "base_rag_type",
            "embedder",
            "embedder_name",
            "rag_status",
            "collection_id",
            "collection_name",
            "total_documents",
            "configured_documents",
            "document_configs",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
    
    def get_total_documents(self, obj):
        """Get total documents in collection."""
        return obj.base_rag_type.source_collection.documents.count()
    
    def get_configured_documents(self, obj):
        """Get count of configured documents."""
        return obj.naive_rag_configs.count()
    

class DocumentConfigBulkUpdateSerializer(serializers.Serializer):
    """
    Serializer for bulk updating document configs.
    Updates multiple configs by their config IDs.
    """
    config_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        allow_empty=False,
        help_text="List of naive_rag_document_config IDs to update"
    )
    chunk_size = serializers.IntegerField(
        required=False,
        help_text="New chunk size (applied to all selected configs)"
    )
    chunk_overlap = serializers.IntegerField(
        required=False,
        help_text="New chunk overlap (applied to all selected configs)"
    )
    chunk_strategy = serializers.ChoiceField(
        required=False,
        choices=NaiveRagDocumentConfig.ChunkStrategy.choices,
        help_text="New chunking strategy (applied to all selected configs)"
    )
    additional_params = serializers.JSONField(
        required=False,
        help_text="New additional parameters (applied to all selected configs)"
    )

    def validate_config_ids(self, value):
        """Validate config_ids list is not empty."""
        if not value:
            raise serializers.ValidationError("config_ids list cannot be empty")
        return value

    def validate(self, attrs):
        """Ensure at least one update field is provided besides config_ids."""
        update_fields = {"chunk_size", "chunk_overlap", "chunk_strategy", "additional_params"}
        if not any(field in attrs for field in update_fields):
            raise serializers.ValidationError(
                "At least one field must be provided for update: "
                "chunk_size, chunk_overlap, chunk_strategy, or additional_params"
            )
        return attrs


class DocumentConfigBulkDeleteSerializer(serializers.Serializer):
    """
    Serializer for bulk deleting document configs.
    Deletes multiple configs by their config IDs.
    """
    config_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=True,
        allow_empty=False,
        help_text="List of naive_rag_document_config IDs to delete"
    )

    def validate_config_ids(self, value):
        """Validate config_ids list is not empty."""
        if not value:
            raise serializers.ValidationError("config_ids list cannot be empty")
        # Remove duplicates
        return list(set(value))


class ProcessNaiveRagDocumentChunkingSerializer(serializers.Serializer):
    naive_rag_document_id = serializers.IntegerField(required=True)


class NaiveRagChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = NaiveRagChunk
        fields = "__all__"

    # def validate_naive_rag_document_id(self, value):
    #     if not NaiveRagDocumentConfig.objects.filter(naive_rag_document_id=value).exists():
    #         raise serializers.ValidationError("NaiveRag Document config with this id does not exist.")
    #     return value


