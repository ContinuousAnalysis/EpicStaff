from drf_yasg import openapi

# --- Reusable parameters ---

_username_param = openapi.Parameter(
    "username",
    openapi.IN_QUERY,
    description="Name of the user performing the operation (defaults to 'default')",
    type=openapi.TYPE_STRING,
    required=False,
)

_org_id_param = openapi.Parameter(
    "org_id",
    openapi.IN_QUERY,
    description="Organization ID (defaults to 'default' org)",
    type=openapi.TYPE_INTEGER,
    required=False,
)

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

# --- Reusable body fields ---

_username_field = openapi.Schema(
    type=openapi.TYPE_STRING, description="Name of the user performing the operation"
)

_org_id_field = openapi.Schema(type=openapi.TYPE_INTEGER, description="Organization ID")

# --- Reusable schemas ---

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
    required=["username", "org_id", "from", "to"],
    properties={
        "username": _username_field,
        "org_id": _org_id_field,
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
    manual_parameters=[_username_param, _org_id_param, _path_param],
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
    manual_parameters=[_username_param, _org_id_param, _path_param],
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
    manual_parameters=[_username_param, _org_id_param, _path_param],
    responses={
        200: openapi.Response(description="File content as binary stream"),
    },
)

STORAGE_UPLOAD_SWAGGER = dict(
    operation_summary="Upload files",
    operation_description=(
        "Upload one or more files to the specified path. Send as multipart/form-data with "
        "`files` (one or more files), `path` (target folder), `username`, and `org_id`. "
        "Archives (ZIP/TAR) are automatically extracted."
    ),
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["username", "org_id", "files"],
        properties={
            "username": _username_field,
            "org_id": _org_id_field,
            "files": openapi.Schema(
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(type=openapi.TYPE_FILE),
                description="Files to upload",
            ),
            "path": openapi.Schema(
                type=openapi.TYPE_STRING,
                description="Target folder path",
                default="/",
            ),
        },
    ),
    responses={
        201: openapi.Response(
            description="Upload successful",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "uploaded": openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        description="Results for each uploaded file",
                        items=openapi.Schema(
                            type=openapi.TYPE_OBJECT,
                            properties={
                                "type": openapi.Schema(
                                    type=openapi.TYPE_STRING,
                                    enum=["file", "archive"],
                                    description="Whether the file was uploaded as-is or extracted as an archive",
                                ),
                                "path": openapi.Schema(
                                    type=openapi.TYPE_STRING,
                                    description="Relative path (regular files only)",
                                ),
                                "size": openapi.Schema(
                                    type=openapi.TYPE_INTEGER,
                                    description="File size in bytes (regular files only)",
                                ),
                                "extracted": openapi.Schema(
                                    type=openapi.TYPE_ARRAY,
                                    items=openapi.Schema(type=openapi.TYPE_STRING),
                                    description="Extracted file paths (archives only)",
                                ),
                            },
                        ),
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
        required=["username", "org_id", "paths"],
        properties={
            "username": _username_field,
            "org_id": _org_id_field,
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
        required=["username", "org_id", "path"],
        properties={
            "username": _username_field,
            "org_id": _org_id_field,
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
    manual_parameters=[_username_param, _org_id_param, _path_param],
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
    operation_description=(
        "Moves a file or folder from one location to another. "
        "To move across organizations, provide `source_org_id` and `destination_org_id` "
        "instead of `org_id` — the user must be a member of both orgs."
    ),
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["username", "from", "to"],
        properties={
            "username": _username_field,
            "org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Organization ID (for same-org move)",
            ),
            "from": openapi.Schema(type=openapi.TYPE_STRING, description="Source path"),
            "to": openapi.Schema(
                type=openapi.TYPE_STRING, description="Destination path"
            ),
            "source_org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Source organization ID (cross-org move)",
            ),
            "destination_org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Destination organization ID (cross-org move)",
            ),
        },
    ),
    responses={
        200: openapi.Response(
            description="Moved successfully", schema=_from_to_response
        ),
    },
)

STORAGE_COPY_SWAGGER = dict(
    operation_summary="Copy a file or folder",
    operation_description=(
        "Creates a copy of a file or folder at the destination path. "
        "To copy across organizations, provide `source_org_id` and `destination_org_id` "
        "instead of `org_id` — the user must be a member of both orgs."
    ),
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=["username", "from", "to"],
        properties={
            "username": _username_field,
            "org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Organization ID (for same-org copy)",
            ),
            "from": openapi.Schema(type=openapi.TYPE_STRING, description="Source path"),
            "to": openapi.Schema(
                type=openapi.TYPE_STRING, description="Destination path"
            ),
            "source_org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Source organization ID (cross-org copy)",
            ),
            "destination_org_id": openapi.Schema(
                type=openapi.TYPE_INTEGER,
                description="Destination organization ID (cross-org copy)",
            ),
        },
    ),
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
    manual_parameters=[_username_param, _org_id_param, _session_id_param],
    responses={
        200: openapi.Response(
            description="Session output files",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "items": openapi.Schema(
                        type=openapi.TYPE_ARRAY,
                        items=_file_item,
                    ),
                },
            ),
        ),
    },
)
