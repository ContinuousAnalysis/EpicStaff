from drf_yasg import openapi

# --- Reusable schemas ---

_path_param = openapi.Parameter(
    "path",
    openapi.IN_QUERY,
    description="Storage path (e.g. `/` or `/reports/`)",
    type=openapi.TYPE_STRING,
    default="/",
)

_session_id_param = openapi.Parameter(
    "session_id",
    openapi.IN_QUERY,
    description="Session ID to retrieve output files for",
    type=openapi.TYPE_INTEGER,
    required=True,
)

_file_item = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "name": openapi.Schema(
            type=openapi.TYPE_STRING, description="File or folder name"
        ),
        "type": openapi.Schema(
            type=openapi.TYPE_STRING, enum=["file", "folder"], description="Item type"
        ),
        "size": openapi.Schema(
            type=openapi.TYPE_INTEGER, description="File size in bytes (files only)"
        ),
        "modified": openapi.Schema(
            type=openapi.TYPE_STRING,
            format="date-time",
            description="Last modified timestamp",
        ),
    },
)

_from_to_body = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    required=["from", "to"],
    properties={
        "from": openapi.Schema(type=openapi.TYPE_STRING, description="Source path"),
        "to": openapi.Schema(type=openapi.TYPE_STRING, description="Destination path"),
    },
)

_from_to_response = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        "from": openapi.Schema(type=openapi.TYPE_STRING),
        "to": openapi.Schema(type=openapi.TYPE_STRING),
        "success": openapi.Schema(type=openapi.TYPE_BOOLEAN),
    },
)

# --- Endpoint schemas ---

STORAGE_LIST_SWAGGER = dict(
    operation_summary="List files and folders",
    operation_description="Returns the contents of a storage folder (files and subfolders with name, type, size, modified).",
    manual_parameters=[_path_param],
    responses={
        200: openapi.Response(
            description="Folder contents",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "path": openapi.Schema(type=openapi.TYPE_STRING),
                    "items": openapi.Schema(type=openapi.TYPE_ARRAY, items=_file_item),
                },
            ),
        ),
    },
)

STORAGE_INFO_SWAGGER = dict(
    operation_summary="Get file metadata",
    operation_description="Returns metadata for a single file (name, size, content_type, modified, created, etag).",
    manual_parameters=[_path_param],
    responses={
        200: openapi.Response(
            description="File metadata",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "path": openapi.Schema(type=openapi.TYPE_STRING),
                    "name": openapi.Schema(type=openapi.TYPE_STRING),
                    "type": openapi.Schema(type=openapi.TYPE_STRING),
                    "size": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "modified": openapi.Schema(
                        type=openapi.TYPE_STRING, format="date-time"
                    ),
                    "created": openapi.Schema(
                        type=openapi.TYPE_STRING, format="date-time"
                    ),
                    "content_type": openapi.Schema(type=openapi.TYPE_STRING),
                    "etag": openapi.Schema(type=openapi.TYPE_STRING),
                },
            ),
        ),
    },
)

STORAGE_DOWNLOAD_SWAGGER = dict(
    operation_summary="Download a file",
    operation_description="Downloads a single file by path. Returns the file content with appropriate Content-Disposition header.",
    manual_parameters=[_path_param],
    responses={
        200: openapi.Response(description="File content as binary stream"),
    },
)

STORAGE_UPLOAD_SWAGGER = dict(
    operation_summary="Upload a file",
    operation_description=(
        "Upload a file to the specified path. Send as multipart/form-data with "
        "`file` (the file) and `path` (target folder)."
    ),
    manual_parameters=[
        openapi.Parameter(
            "file",
            openapi.IN_FORM,
            description="File to upload",
            type=openapi.TYPE_FILE,
            required=True,
        ),
        openapi.Parameter(
            "path",
            openapi.IN_FORM,
            description="Target folder path",
            type=openapi.TYPE_STRING,
            default="/",
        ),
    ],
    responses={
        201: openapi.Response(
            description="Upload successful",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "path": openapi.Schema(
                        type=openapi.TYPE_STRING,
                        description="Full path of uploaded file",
                    ),
                    "size": openapi.Schema(
                        type=openapi.TYPE_INTEGER, description="File size in bytes"
                    ),
                },
            ),
        ),
    },
)

STORAGE_UPLOAD_ARCHIVE_SWAGGER = dict(
    operation_summary="Upload and extract an archive",
    operation_description=(
        "Upload a .zip archive. The server extracts its contents into the target folder, "
        "preserving folder structure. Send as multipart/form-data."
    ),
    manual_parameters=[
        openapi.Parameter(
            "file",
            openapi.IN_FORM,
            description="Archive file (.zip) to upload and extract",
            type=openapi.TYPE_FILE,
            required=True,
        ),
        openapi.Parameter(
            "path",
            openapi.IN_FORM,
            description="Target folder path for extraction",
            type=openapi.TYPE_STRING,
            default="/",
        ),
    ],
    responses={
        201: openapi.Response(
            description="Archive extracted successfully",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "extracted": openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=openapi.Schema(type=openapi.TYPE_STRING),
                        description="List of extracted file paths",
                    ),
                },
            ),
        ),
    },
)

STORAGE_DOWNLOAD_ZIP_SWAGGER = dict(
    operation_summary="Download multiple files as zip",
    operation_description="Accepts a list of file paths and returns them bundled in a single .zip archive.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["paths"],
        properties={
            "paths": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_STRING),
                description="List of file paths to include in the zip",
            ),
        },
    ),
    responses={
        200: openapi.Response(description="Zip file as binary stream"),
    },
)

STORAGE_MKDIR_SWAGGER = dict(
    operation_summary="Create a folder",
    operation_description="Creates a new folder at the specified path.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["path"],
        properties={
            "path": openapi.Schema(
                type=openapi.TYPE_STRING, description="Folder path to create"
            ),
        },
    ),
    responses={
        201: openapi.Response(
            description="Folder created",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "path": openapi.Schema(type=openapi.TYPE_STRING),
                    "created": openapi.Schema(type=openapi.TYPE_BOOLEAN),
                },
            ),
        ),
    },
)

STORAGE_DELETE_SWAGGER = dict(
    operation_summary="Delete a file or folder",
    operation_description="Deletes the file or folder at the specified path.",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["path"],
        properties={
            "path": openapi.Schema(
                type=openapi.TYPE_STRING, description="Path to delete"
            ),
        },
    ),
    responses={
        204: openapi.Response(description="Deleted successfully"),
    },
)

STORAGE_RENAME_SWAGGER = dict(
    operation_summary="Rename a file or folder",
    operation_description="Renames a file or folder from one path to another within the same directory.",
    request_body=_from_to_body,
    responses={
        200: openapi.Response(
            description="Renamed successfully", schema=_from_to_response
        ),
    },
)

STORAGE_MOVE_SWAGGER = dict(
    operation_summary="Move a file or folder",
    operation_description="Moves a file or folder from one location to another.",
    request_body=_from_to_body,
    responses={
        200: openapi.Response(
            description="Moved successfully", schema=_from_to_response
        ),
    },
)

STORAGE_COPY_SWAGGER = dict(
    operation_summary="Copy a file or folder",
    operation_description="Creates a copy of a file or folder at the destination path. Both source and destination will exist after the operation.",
    request_body=_from_to_body,
    responses={
        200: openapi.Response(
            description="Copied successfully", schema=_from_to_response
        ),
    },
)

STORAGE_ADD_TO_FLOW_SWAGGER = dict(
    operation_summary="Add a storage file reference to a flow",
    operation_description=(
        "Creates a domain variable with a `storage://` reference in the flow's start node, "
        "linking a storage file or folder to a flow."
    ),
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["path", "flow_id", "variable_name"],
        properties={
            "path": openapi.Schema(
                type=openapi.TYPE_STRING, description="Storage path to link"
            ),
            "flow_id": openapi.Schema(
                type=openapi.TYPE_INTEGER, description="Target flow ID"
            ),
            "variable_name": openapi.Schema(
                type=openapi.TYPE_STRING, description="Variable name for the start node"
            ),
        },
    ),
    responses={
        200: openapi.Response(
            description="Reference added",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "path": openapi.Schema(type=openapi.TYPE_STRING),
                    "flow_id": openapi.Schema(type=openapi.TYPE_INTEGER),
                    "variable_name": openapi.Schema(type=openapi.TYPE_STRING),
                },
            ),
        ),
    },
)

STORAGE_SESSION_OUTPUTS_SWAGGER = dict(
    operation_summary="List session output files",
    operation_description="Returns the list of files written to storage during a specific flow session.",
    manual_parameters=[_session_id_param],
    responses={
        200: openapi.Response(
            description="Session output files",
            schema=openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        "path": openapi.Schema(type=openapi.TYPE_STRING),
                        "size": openapi.Schema(type=openapi.TYPE_INTEGER),
                        "created": openapi.Schema(
                            type=openapi.TYPE_STRING, format="date-time"
                        ),
                    },
                ),
            ),
        ),
    },
)
