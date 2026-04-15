from tables.serializers.storage_serializers import (
    GraphStorageFileSerializer,
    StorageAddToGraphSerializer,
    StorageBulkDeleteSerializer,
    StorageCopySerializer,
    StorageDownloadZipSerializer,
    StorageFromToResponseSerializer,
    StorageGraphFilesQuerySerializer,
    StorageInfoResponseSerializer,
    StorageListResponseSerializer,
    StorageMkdirResponseSerializer,
    StorageMkdirSerializer,
    StorageMoveSerializer,
    StoragePathQuerySerializer,
    StorageRemoveFromGraphSerializer,
    StorageRenameSerializer,
    StorageUploadResponseSerializer,
    StorageUploadSerializer,
)

STORAGE_LIST_SWAGGER = dict(
    operation_summary="List files and folders",
    operation_description=(
        "Returns the contents of a storage folder "
        "(files and subfolders with name, type, size, modified)."
    ),
    query_serializer=StoragePathQuerySerializer,
    responses={200: StorageListResponseSerializer},
)

STORAGE_INFO_SWAGGER = dict(
    operation_summary="Get file metadata",
    operation_description=(
        "Returns metadata for a single file "
        "(name, size, content_type, modified, created, etag)."
    ),
    query_serializer=StoragePathQuerySerializer,
    responses={200: StorageInfoResponseSerializer},
)

STORAGE_DOWNLOAD_SWAGGER = dict(
    operation_summary="Download a file",
    operation_description=(
        "Downloads a single file by path. Returns the file content "
        "with appropriate Content-Disposition header."
    ),
    query_serializer=StoragePathQuerySerializer,
    responses={200: "File content as binary stream"},
)

STORAGE_UPLOAD_SWAGGER = dict(
    operation_summary="Upload files",
    operation_description=(
        "Upload one or more files to the specified path. Send as "
        "multipart/form-data with `files` (one or more files) and "
        "`path` (target folder). Archives (ZIP/TAR) are automatically "
        "extracted. Executable files are rejected."
    ),
    request_body=StorageUploadSerializer,
    responses={201: StorageUploadResponseSerializer},
)

STORAGE_DOWNLOAD_ZIP_SWAGGER = dict(
    operation_summary="Download multiple files as zip",
    operation_description=(
        "Accepts a list of file paths and returns them bundled "
        "in a single .zip archive."
    ),
    request_body=StorageDownloadZipSerializer,
    responses={200: "Zip file as binary stream"},
)

STORAGE_MKDIR_SWAGGER = dict(
    operation_summary="Create a folder",
    operation_description="Creates a new folder at the specified path.",
    request_body=StorageMkdirSerializer,
    responses={201: StorageMkdirResponseSerializer},
)

STORAGE_DELETE_SWAGGER = dict(
    operation_summary="Bulk delete files or folders",
    operation_description="Deletes the files or folders at the specified paths.",
    request_body=StorageBulkDeleteSerializer,
    responses={204: "Deleted successfully"},
)

STORAGE_RENAME_SWAGGER = dict(
    operation_summary="Rename a file or folder",
    operation_description=(
        "Renames a file or folder from one path to another within the same directory."
    ),
    request_body=StorageRenameSerializer,
    responses={200: StorageFromToResponseSerializer},
)

STORAGE_MOVE_SWAGGER = dict(
    operation_summary="Move a file or folder",
    operation_description=(
        "Moves a file or folder from one location to another. "
        "To move across organizations, provide `source_org_id` and "
        "`destination_org_id` — the user must be a member of both orgs."
    ),
    request_body=StorageMoveSerializer,
    responses={200: StorageFromToResponseSerializer},
)

STORAGE_COPY_SWAGGER = dict(
    operation_summary="Copy a file or folder",
    operation_description=(
        "Creates a copy of a file or folder at the destination path. "
        "To copy across organizations, provide `source_org_id` and "
        "`destination_org_id` — the user must be a member of both orgs."
    ),
    request_body=StorageCopySerializer,
    responses={200: StorageFromToResponseSerializer},
)

STORAGE_ADD_TO_GRAPH_SWAGGER = dict(
    operation_summary="Add a storage file reference to graphs",
    operation_description=(
        "Creates a database reference linking a storage file or folder to one or more graphs."
    ),
    request_body=StorageAddToGraphSerializer,
    responses={201: GraphStorageFileSerializer(many=True)},
)

STORAGE_REMOVE_FROM_GRAPH_SWAGGER = dict(
    operation_summary="Remove a storage file reference from graphs",
    operation_description="Removes the database link between a storage path and the given graphs.",
    request_body=StorageRemoveFromGraphSerializer,
    responses={204: "Removed successfully"},
)

STORAGE_GRAPH_FILES_SWAGGER = dict(
    operation_summary="List storage files attached to a graph",
    operation_description="Returns all storage paths that have been linked to the given graph.",
    query_serializer=StorageGraphFilesQuerySerializer,
    responses={200: GraphStorageFileSerializer(many=True)},
)
