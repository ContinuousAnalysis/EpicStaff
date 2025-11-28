from rest_framework import serializers

from tables.models.knowledge_models import SourceCollection, DocumentMetadata


class DocumentMetadataSerializer(serializers.ModelSerializer):
    """
    Serializer for DocumentMetadata.
    Used for displaying uploaded document information.
    """

    class Meta:
        model = DocumentMetadata
        fields = [
            "document_id",
            "file_name",
            "file_type",
            "file_size",
            "source_collection",
        ]
        read_only_fields = fields


class DocumentListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for listing documents in a collection.
    """

    class Meta:
        model = DocumentMetadata
        fields = [
            "document_id",
            "file_name",
            "file_type",
            "file_size",
        ]
        read_only_fields = fields


class DocumentUploadSerializer(serializers.Serializer):
    """
    Serializer for uploading documents to a collection.
    Handles multiple file uploads (drag & drop support).
    """

    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=False,
        write_only=True,
        help_text="List of files to upload (supports multiple files)",
    )

    def validate_files(self, value):
        """
        Basic validation - just ensure files list is not empty.
        Detailed validation is done in DocumentManagementService.
        """
        if not value:
            raise serializers.ValidationError("At least one file must be provided.")
        return value


class DocumentBulkDeleteSerializer(serializers.Serializer):
    """
    Serializer for bulk deletion of documents.
    Accepts list of document IDs to delete.
    """

    document_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        help_text="List of document IDs to delete",
    )

    def validate_document_ids(self, value):
        """
        Validate document IDs list.
        """
        if not value:
            raise serializers.ValidationError(
                "At least one document ID must be provided."
            )

        # Remove duplicates
        unique_ids = list(set(value))

        return unique_ids


class DocumentDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for single document view.
    """

    collection_name = serializers.CharField(
        source="source_collection.collection_name", read_only=True
    )

    class Meta:
        model = DocumentMetadata
        fields = [
            "document_id",
            "file_name",
            "file_type",
            "file_size",
            "source_collection",
            "collection_name",
        ]
        read_only_fields = fields


class SourceCollectionListSerializer(serializers.ModelSerializer):
    """
    Serializer for listing collections.
    Shows basic collection info without related documents.
    """

    document_count = serializers.IntegerField(source="documents.count", read_only=True)

    class Meta:
        model = SourceCollection
        fields = [
            "collection_id",
            "collection_name",
            "user_id",
            "status",
            "document_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SourceCollectionDetailSerializer(serializers.ModelSerializer):
    """
    Serializer for retrieving a single collection with all details.
    Can include related documents if needed via prefetch.
    """

    document_count = serializers.IntegerField(source="documents.count", read_only=True)

    class Meta:
        model = SourceCollection
        fields = [
            "collection_id",
            "collection_name",
            "user_id",
            "status",
            "document_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SourceCollectionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new empty collection.
    """

    class Meta:
        model = SourceCollection
        fields = [
            "collection_id",
            "collection_name",
            "user_id",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "collection_id",
            "status",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "collection_name": {"required": False, "allow_blank": True},
            "user_id": {"required": False},
        }
        validators = [] 

    def validate_collection_name(self, value):
        if value and len(value) > 255:
            raise serializers.ValidationError(
                "Collection name must be 255 characters or less."
            )
        return value


class SourceCollectionUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating collection.
    Only allows updating collection_name.
    """

    class Meta:
        model = SourceCollection
        fields = ["collection_name"]

    def validate_collection_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Collection name cannot be empty.")
        if len(value) > 255:
            raise serializers.ValidationError(
                "Collection name must be 255 characters or less."
            )
        return value


class UpdateSourceCollectionSerializer(serializers.ModelSerializer):
    """
    Serializer for updating only specific fields of a SourceCollection.
    """

    class Meta:
        model = SourceCollection
        fields = ["collection_name"]
        validators = []


class CopySourceCollectionSerializer(serializers.Serializer):
    new_collection_name = serializers.CharField(required=False)


# class CollectionStatusSerializer(serializers.ModelSerializer):

#     class Meta:
#         model = SourceCollection
#         fields = ["collection_id", "collection_name", "status"]

#     def to_representation(self, obj):
#         """Custom representation to control response structure"""
#         return {
#             "collection_id": obj.collection_id,
#             "collection_name": obj.collection_name,
#             "collection_status": obj.status,
#             "total_documents": obj.total_documents,
#             "new_documents": obj.new_documents,
#             "completed_documents": obj.completed_documents,
#             "processing_documents": obj.processing_documents,
#             "failed_documents": obj.failed_documents,
#             "documents": [
#                 {
#                     "document_id": doc.document_id,
#                     "file_name": doc.file_name,
#                     "status": doc.status,
#                 }
#                 for doc in obj.document_metadata.all()
#             ],
#         }
