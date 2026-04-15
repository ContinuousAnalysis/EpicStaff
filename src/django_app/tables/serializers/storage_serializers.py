import os

from rest_framework import serializers

from tables.validators.file_upload_validator import FileValidator


class StoragePathQuerySerializer(serializers.Serializer):
    path = serializers.CharField(
        required=False,
        default="",
        help_text="Storage path (e.g. `/` or `/reports/`)",
    )


class StorageSessionOutputsQuerySerializer(serializers.Serializer):
    session_id = serializers.CharField(
        required=True,
        help_text="Session ID to retrieve output files for",
    )


class StorageUploadSerializer(serializers.Serializer):
    path = serializers.CharField(
        required=False,
        default="",
        help_text="Target folder path",
    )
    files = serializers.ListField(
        child=serializers.FileField(),
        allow_empty=False,
        help_text="Files to upload",
    )

    def validate_files(self, value):
        return FileValidator().validate(value)


class StorageMkdirSerializer(serializers.Serializer):
    path = serializers.CharField(
        required=True,
        help_text="Folder path to create",
    )


class StorageBulkDeleteSerializer(serializers.Serializer):
    paths = serializers.ListField(
        child=serializers.CharField(),
        min_length=1,
        help_text="List of storage paths to delete",
    )


class StorageDownloadZipSerializer(serializers.Serializer):
    paths = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=False,
        help_text="List of file paths to include in the zip",
    )


class StorageRenameSerializer(serializers.Serializer):
    from_path = serializers.CharField(source="from", help_text="Source path")
    to_path = serializers.CharField(source="to", help_text="Destination path")

    def validate_to_path(self, value: str) -> str:
        if FileValidator().is_executable_filename(value):
            ext = os.path.splitext(value)[1].lower()
            raise serializers.ValidationError(
                f"Renaming to '{ext}' is not allowed: blocked executable extension."
            )
        return value


class StorageMoveSerializer(serializers.Serializer):
    from_path = serializers.CharField(source="from", help_text="Source path")
    to_path = serializers.CharField(source="to", help_text="Destination path")
    source_org_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Source organization ID (cross-org move)",
    )
    destination_org_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Destination organization ID (cross-org move)",
    )


class StorageCopySerializer(serializers.Serializer):
    from_path = serializers.CharField(source="from", help_text="Source path")
    to_path = serializers.CharField(source="to", help_text="Destination path")
    source_org_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Source organization ID (cross-org copy)",
    )
    destination_org_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Destination organization ID (cross-org copy)",
    )


class StorageAddToGraphSerializer(serializers.Serializer):
    path = serializers.CharField(
        required=True,
        help_text="Storage path to link",
    )
    graph_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        help_text="Target graph IDs",
    )


class FileItemSerializer(serializers.Serializer):
    name = serializers.CharField(help_text="File or folder name")
    type = serializers.ChoiceField(
        choices=["file", "folder"],
        help_text="Item type",
    )
    size = serializers.IntegerField(
        required=False,
        help_text="File size in bytes (files only)",
    )
    modified = serializers.DateTimeField(
        required=False,
        help_text="Last modified timestamp",
    )
    is_empty = serializers.BooleanField(
        help_text="True if the folder has no children. Always False for files.",
    )


class StorageListResponseSerializer(serializers.Serializer):
    path = serializers.CharField(help_text="Requested path")
    items = FileItemSerializer(many=True, help_text="Folder contents")


class StorageInfoResponseSerializer(serializers.Serializer):
    path = serializers.CharField(help_text="File path")
    name = serializers.CharField(help_text="File name")
    type = serializers.CharField(help_text="Item type")
    size = serializers.IntegerField(help_text="File size in bytes")
    modified = serializers.DateTimeField(help_text="Last modified timestamp")
    created = serializers.DateTimeField(required=False, help_text="Creation timestamp")
    content_type = serializers.CharField(required=False, help_text="MIME content type")
    etag = serializers.CharField(required=False, help_text="Entity tag")
    graphs = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of all graph names",
    )


class StorageUploadResultSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=["file", "archive"],
        help_text="Whether the file was uploaded as-is or extracted as an archive",
    )
    path = serializers.CharField(
        required=False,
        help_text="Relative path (regular files only)",
    )
    size = serializers.IntegerField(
        required=False,
        help_text="File size in bytes (regular files only)",
    )
    extracted = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        help_text="Extracted file paths (archives only)",
    )


class StorageUploadResponseSerializer(serializers.Serializer):
    uploaded = StorageUploadResultSerializer(
        many=True,
        help_text="Results for each uploaded file",
    )


class StorageFromToResponseSerializer(serializers.Serializer):
    from_path = serializers.CharField(source="from", help_text="Source path")
    to_path = serializers.CharField(source="to", help_text="Destination path")
    success = serializers.BooleanField(help_text="Operation succeeded")


class StorageMkdirResponseSerializer(serializers.Serializer):
    path = serializers.CharField(help_text="Created folder path")
    created = serializers.BooleanField(help_text="Whether the folder was created")


class GraphStorageFileSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    graph_id = serializers.IntegerField(read_only=True)
    path = serializers.CharField(source="storage_file.path", read_only=True)
    added_at = serializers.DateTimeField(read_only=True)


class StorageRemoveFromGraphSerializer(serializers.Serializer):
    path = serializers.CharField(
        required=True,
        help_text="Storage path to unlink",
    )
    graph_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        help_text="Graph IDs to unlink from",
    )


class StorageGraphFilesQuerySerializer(serializers.Serializer):
    graph_id = serializers.IntegerField(
        required=True,
        help_text="Graph ID to list attached files for",
    )


class StorageSessionOutputsResponseSerializer(serializers.Serializer):
    items = FileItemSerializer(many=True, help_text="Session output files")
