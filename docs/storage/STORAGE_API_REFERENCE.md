# Storage API Reference

## Complete API Endpoint Documentation

This document provides a comprehensive reference for all storage-related API endpoints with request/response examples.

Base path: `/api/storage/`

---

## Table of Contents

1. [List Files](#list-files)
2. [File Info](#file-info)
3. [Download File](#download-file)
4. [Upload Files](#upload-files)
5. [Download ZIP](#download-zip)
6. [Create Folder](#create-folder)
7. [Bulk Delete](#bulk-delete)
8. [Rename](#rename)
9. [Move](#move)
10. [Copy](#copy)
11. [Add to Graph](#add-to-graph)
12. [Remove from Graph](#remove-from-graph)
13. [Graph Files](#graph-files)
14. [Session Output Files](#session-output-files)
15. [Blocked Extensions Reference](#blocked-extensions-reference)
16. [Archive Format Reference](#archive-format-reference)
17. [Path Normalization](#path-normalization)
18. [HTTP Status Codes](#http-status-codes)

---

## List Files

**GET** `/api/storage/list/`

Lists files and folders at the given path.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `path` | string | No | `""` | Directory path to list |

**Response:** `200 OK`
```json
{
    "path": "reports",
    "items": [
        {"name": "Q1-summary.pdf", "type": "file", "size": 102400, "modified": "2026-04-15T10:30:00Z", "is_empty": false},
        {"name": "charts", "type": "folder", "size": 0, "modified": null, "is_empty": true}
    ]
}
```

**Item fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | File or folder name |
| `type` | string | `"file"` or `"folder"` |
| `size` | integer | Size in bytes; `0` for folders |
| `modified` | string \| null | ISO 8601 timestamp; `null` for empty folders |
| `is_empty` | boolean | Always present. `true` if the folder has no children; always `false` for files |

---

## File Info

**GET** `/api/storage/info/`

Returns metadata for a file or folder, including linked graphs.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to the file or folder |

**Response (file):** `200 OK`
```json
{
    "name": "Q1-summary.pdf",
    "path": "reports/Q1-summary.pdf",
    "size": 102400,
    "content_type": "application/pdf",
    "modified": "2026-04-15T10:30:00Z",
    "graphs": [{"id": 1, "name": "Monthly Report Flow"}]
}
```

**Response (folder):** `200 OK`
```json
{
    "name": "reports",
    "path": "reports",
    "modified": "2026-04-15T10:30:00Z",
    "graphs": []
}
```

**Error:** `400 Bad Request`
```json
{"path": "File does not exist: some/path"}
```

---

## Download File

**GET** `/api/storage/download/`

Downloads a single file as a binary stream.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Path to the file |

**Response:** `200 OK`
- Content-Type: `application/octet-stream`
- Header: `Content-Disposition: attachment; filename="<name>"`
- Body: Binary file stream

**Error:** `400 Bad Request`
```json
{"path": "File does not exist: some/path"}
```

---

## Upload Files

**POST** `/api/storage/upload/`

Uploads one or more files. ZIP and TAR archives are auto-extracted into a subfolder named after the archive stem. Document formats (`.xlsx`, `.docx`, `.pptx`, `.jar`, etc.) are uploaded as-is and not extracted.

**Request:**
- Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | No | Destination directory path |
| `files` | file[] | Yes | One or more files; must be non-empty |

**Validation rules:**
- Blocks executable extensions (see [Blocked Extensions Reference](#blocked-extensions-reference))
- Blocks unsupported archive formats (see [Archive Format Reference](#archive-format-reference))
- Scans ZIP/TAR contents for executables before extraction
- Rejects password-protected archives

**Response (regular file):** `201 Created`
```json
{
    "uploaded": [
        {"type": "file", "path": "reports/data.csv", "size": 5120}
    ]
}
```

**Response (auto-extracted archive):** `201 Created`
```json
{
    "uploaded": [
        {"type": "archive", "extracted": ["reports/dataset/file1.csv", "reports/dataset/file2.csv"]}
    ]
}
```

**Error:** `400 Bad Request`
```json
{"detail": "Upload rejected. '.exe' has a blocked executable extension"}
```

---

## Download ZIP

**POST** `/api/storage/download-zip/`

Packages one or more files and/or folders into a ZIP archive and streams it. Folders are recursively included.

**Request:**
```json
{"paths": ["reports/file1.csv", "reports/file2.csv"]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paths` | string[] | Yes | Paths to include in the ZIP |

**Response:** `200 OK`
- Content-Type: `application/zip`
- Header: `Content-Disposition: attachment; filename="download.zip"`
- Body: Binary ZIP stream

**Error:** `400 Bad Request`
```json
{"paths": "..."}
```

---

## Create Folder

**POST** `/api/storage/mkdir/`

Creates a new folder at the specified path, including any intermediate directories.

**Request:**
```json
{"path": "reports/2026"}
```

**Response:** `201 Created`
```json
{"path": "reports/2026", "created": true}
```

---

## Bulk Delete

**DELETE** `/api/storage/delete/`

Deletes one or more files or folders. Folders are deleted recursively.

**Request:**
```json
{"paths": ["reports/old-file.csv", "reports/archive"]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paths` | string[] | Yes | At least 1 path required |

**Response:** `204 No Content`

---

## Rename

**POST** `/api/storage/rename/`

Renames a file or folder in-place. Cannot rename to a blocked executable extension.

**Request:**
```json
{"from": "reports/old-name.pdf", "to": "reports/new-name.pdf"}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Current path of the file or folder |
| `to` | string | Yes | New path (same directory) |

**Response:** `200 OK`
```json
{"from": "reports/old-name.pdf", "to": "reports/new-name.pdf", "success": true}
```

**Error (source not found):** `400 Bad Request`
```json
{"from": "Source path does not exist: ..."}
```

**Error (destination exists):** `400 Bad Request`
```json
{"to": "Destination already exists: ..."}
```

**Error (blocked extension):** `400 Bad Request`
```json
{"detail": "..."}
```

---

## Move

**POST** `/api/storage/move/`

Moves a file or folder to a new location. Supports cross-organization moves by providing `source_org_id` and `destination_org_id`.

> **Note:** Cross-org move is non-atomic. If the delete step fails after the copy completes, the file will exist in both organizations.

**Request (same org):**
```json
{"from": "reports/file.pdf", "to": "archive/file.pdf"}
```

**Request (cross-org):**
```json
{
    "from": "reports/file.pdf",
    "to": "archive/file.pdf",
    "source_org_id": 1,
    "destination_org_id": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Source path |
| `to` | string | Yes | Destination path |
| `source_org_id` | integer \| null | No | Source organization ID for cross-org move |
| `destination_org_id` | integer \| null | No | Destination organization ID for cross-org move |

**Response:** `200 OK`
```json
{"from": "reports/file.pdf", "to": "archive/file.pdf", "success": true}
```

**Error:** `400 Bad Request`
```json
{"from": "Source path does not exist: ..."}
```

---

## Copy

**POST** `/api/storage/copy/`

Copies a file or folder to a new location. Supports cross-organization copies. If the destination path already exists, the name is auto-incremented: `file.pdf` → `file (1).pdf` → `file (2).pdf`.

**Request (same org):**
```json
{"from": "reports/file.pdf", "to": "backup/file.pdf"}
```

**Request (cross-org):**
```json
{
    "from": "reports/file.pdf",
    "to": "backup/file.pdf",
    "source_org_id": 1,
    "destination_org_id": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | string | Yes | Source path |
| `to` | string | Yes | Destination path |
| `source_org_id` | integer \| null | No | Source organization ID for cross-org copy |
| `destination_org_id` | integer \| null | No | Destination organization ID for cross-org copy |

**Response:** `200 OK`
```json
{"from": "reports/file.pdf", "to": "backup/file.pdf", "success": true}
```

---

## Add to Graph

**POST** `/api/storage/add-to-graph/`

Links an existing storage path to one or more graphs. Creates a `StorageFile` record if one does not exist for the path.

**Request:**
```json
{"path": "reports/data.csv", "graph_ids": [1, 2]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Path to the file or folder |
| `graph_ids` | integer[] | Yes | Graph IDs to link |

**Response:** `201 Created`
```json
[
    {"id": 10, "graph_id": 1, "path": "reports/data.csv", "added_at": "2026-04-15T10:30:00Z"},
    {"id": 11, "graph_id": 2, "path": "reports/data.csv", "added_at": "2026-04-15T10:30:00Z"}
]
```

**Error:** `400 Bad Request`
```json
{"path": "Path does not exist: ..."}
```

---

## Remove from Graph

**DELETE** `/api/storage/remove-from-graph/`

Unlinks a storage path from one or more graphs.

**Request:**
```json
{"path": "reports/data.csv", "graph_ids": [1]}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Path to the file or folder |
| `graph_ids` | integer[] | Yes | Graph IDs to unlink |

**Response:** `204 No Content`

---

## Graph Files

**GET** `/api/storage/graph-files/`

Lists all storage paths linked to a specific graph.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `graph_id` | integer | Yes | Graph ID to query |

**Response:** `200 OK`
```json
[
    {"id": 10, "graph_id": 1, "path": "reports/data.csv", "added_at": "2026-04-15T10:30:00Z"},
    {"id": 11, "graph_id": 1, "path": "reports/charts/", "added_at": "2026-04-15T10:31:00Z"}
]
```

---

## Session Output Files

**GET** `/api/sessions/{id}/output-files/`

Lists all files written to storage during a session's execution. This endpoint lives on the `SessionViewSet`, not on `StorageAPIView`.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Session ID |

**Response:** `200 OK`
```json
[
    {"id": 5, "path": "reports/generated-report.pdf", "name": "generated-report.pdf", "added_at": "2026-04-15T11:00:00Z"}
]
```

---

## Blocked Extensions Reference

### Blocked Executable Extensions

Uploading or renaming to any of these extensions is rejected.

| Platform | Extensions |
|----------|------------|
| Windows | `.exe`, `.msi`, `.com`, `.scr`, `.pif`, `.bat`, `.cmd`, `.vbs`, `.vbe`, `.wsh`, `.wsf`, `.ps1`, `.psm1`, `.psd1` |
| Unix/macOS | `.sh`, `.bash`, `.csh`, `.ksh`, `.zsh`, `.app`, `.command`, `.elf` |
| Java | `.jar`, `.war`, `.ear` |
| Shared libs | `.dll`, `.so`, `.dylib` |

---

## Archive Format Reference

### Blocked Archive Formats

These archive formats are rejected on upload.

`.rar`, `.7z`, `.cab`, `.iso`, `.arj`, `.lzh`, `.ace`, `.arc`, `.lz`, `.lzma`, `.zst`

### Supported Archive Formats (auto-extracted)

These formats are accepted and automatically extracted into a subfolder named after the archive stem.

`.zip`, `.tar`, `.tar.gz`, `.tar.bz2`, `.tar.xz`

---

## Path Normalization

All path inputs are normalized before processing:

- Trailing slashes are stripped from all inputs
- Paths never start with `/`
- Folder paths stored in the database use a trailing `/`

---

## HTTP Status Codes

| Code | Meaning | Common Use |
|------|---------|------------|
| 200 | OK | Successful GET, POST (non-creating), rename, move, copy |
| 201 | Created | Successful upload, folder creation, add-to-graph |
| 204 | No Content | Successful delete, remove-from-graph |
| 400 | Bad Request | Validation error, path not found, blocked extension |
| 500 | Internal Server Error | Unexpected server error |
