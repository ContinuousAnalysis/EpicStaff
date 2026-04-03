# Storage Backend Guide

## Overview

The application supports three storage backends for file management:

| Backend | `STORAGE_BACKEND` value | Use case |
|---------|------------------------|----------|
| **MinIO (S3-compatible)** | `s3` (default) | Development and production with self-hosted object storage |
| **AWS S3** | `s3` | Production with managed cloud storage |
| **Local filesystem** | `local` | Simple deployments without object storage |

The backend is selected at startup via the `STORAGE_BACKEND` environment variable. No code changes are needed to switch.

---

## Quick Start

### MinIO (default)

MinIO starts automatically as a core service. No extra configuration needed.

```bash
docker compose up
```

MinIO console is available at `http://localhost:9001` (default credentials: `minioadmin` / `minioadmin_secret`).
The `minio-init` service auto-creates the bucket on first start.

### AWS S3

```bash
# Set env vars in .env
STORAGE_BACKEND=s3
STORAGE_ENDPOINT=           # leave empty for AWS
STORAGE_ACCESS_KEY=<your-aws-access-key>
STORAGE_SECRET_KEY=<your-aws-secret-key>
STORAGE_BUCKET_NAME=<your-bucket-name>
```

### Local storage

```bash
# Set env vars in .env
STORAGE_BACKEND=local
STORAGE_LOCAL_ROOT=/app/storage
```

Files are stored at the `STORAGE_LOCAL_ROOT` path inside the container.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `s3` | Backend type: `s3` or `local` |
| `STORAGE_ENDPOINT` | `http://minio:9000` | S3 endpoint URL. Leave empty for AWS S3. |
| `STORAGE_ACCESS_KEY` | `minioadmin` | S3 access key / MinIO root user |
| `STORAGE_SECRET_KEY` | `minioadmin_secret` | S3 secret key / MinIO root password |
| `STORAGE_BUCKET_NAME` | `epicstaff` | S3 bucket name |
| `STORAGE_LOCAL_ROOT` | `/app/storage` | Root directory for local backend |
| `MINIO_PORT` | `9000` | MinIO API port (used in healthcheck and mc commands) |
| `MINIO_CONSOLE_PORT` | `9001` | MinIO web console port |

---

## Architecture

```
StorageAPIView (REST endpoints)
       |
  StorageManager (org isolation, permissions)
       |
  get_storage_backend()          <-- factory, reads STORAGE_BACKEND env var
       |
  +-----------+-----------------+
  |                             |
LocalStorageBackend     S3StorageBackend
(pathlib / shutil)      (boto3 / S3 API)
```

### Key files

| File | Purpose |
|------|---------|
| `tables/services/storage/__init__.py` | Factory functions `get_storage_backend()`, `get_storage_manager()` |
| `tables/services/storage/base.py` | `AbstractStorageBackend` interface |
| `tables/services/storage/local_backend.py` | Local filesystem implementation |
| `tables/services/storage/s3_backend.py` | S3/MinIO implementation |
| `tables/services/storage/manager.py` | `StorageManager` (org prefixing, permissions, archive handling) |
| `tables/services/storage/enums.py` | `StorageAction` enum |
| `tables/services/storage/decorators.py` | `@check_permission` decorator |
| `tables/storage_permissions.py` | `StoragePermission` DRF permission class |
| `tables/views/storage_views.py` | `StorageAPIView` REST endpoints |
| `tables/swagger_schemas/storage_schema.py` | Swagger/OpenAPI schema definitions |
| `tables/urls.py` | Router registration (`/api/storage/`) |
| `django_app/settings.py` | `STORAGE_*` settings (read from env) |

---

## Backend Interface

Both backends implement the same `AbstractStorageBackend` methods:

- `list_(prefix)` -- list files and folders
- `upload(path, file)` -- upload a file
- `download(path)` -- download a file
- `delete(path)` -- delete a file or folder
- `mkdir(path)` -- create a folder
- `move(src, dst)` -- move / rename
- `copy(src, dst)` -- copy
- `info(path)` -- file metadata
- `exists(path)` -- check existence
- `download_zip(paths)` -- create a zip archive
- `upload_archive(prefix, archive)` -- extract an archive (ZIP or TAR)

---

## StorageManager

`StorageManager` is an org-aware singleton wrapper around the backend. It is the primary interface used by views.

### Organization isolation

All paths are automatically prefixed with `org_{org_id}/`. The caller works with relative paths only — the org prefix is added/stripped transparently.

### Permission checks

Every public method is decorated with `@check_permission`, which calls `_require_permission()` before touching storage. Currently checks org membership via `OrganizationUser`. Extension points exist for role-based access and path-based ACLs.

### Archive auto-extraction

`upload_file()` detects ZIP and TAR archives and extracts them into the target directory automatically. Supported formats: `.zip`, `.tar`, `.tar.gz`, `.tar.bz2`, `.tar.xz`.

### Cross-org operations

- `copy_cross_org(user_name, src_org_id, src_path, dst_org_id, dst_path)` -- copy between orgs
- `move_cross_org(user_name, src_org_id, src_path, dst_org_id, dst_path)` -- move between orgs (non-atomic: if delete fails after copy, file exists in both)

Both require the user to have permission in source and destination orgs.

---

## API Endpoints

Base path: `/api/storage/`

| Method | Path | Description | Parameters |
|--------|------|-------------|------------|
| GET | `/list` | List files and folders | `path` (query) |
| GET | `/info` | Get file metadata | `path` (query) |
| GET | `/download` | Download a file | `path` (query) |
| POST | `/upload` | Upload files (multipart) | `path` (form), `files` (multipart) |
| POST | `/download-zip` | Download multiple files as ZIP | `paths` (JSON array) |
| POST | `/mkdir` | Create a folder | `path` (body) |
| DELETE | `/delete` | Delete file or folder | `path` (query) |
| POST | `/rename` | Rename file/folder | `from`, `to` (body) |
| POST | `/move` | Move file/folder | `from`, `to`, `source_org_id`, `destination_org_id` (body) |
| POST | `/copy` | Copy file/folder | `from`, `to`, `source_org_id`, `destination_org_id` (body) |
| POST | `/add-to-flow` | Link file to flow (stub) | `path`, `flow_id`, `variable_name` (body) |
| GET | `/session-outputs` | List session output files | `session_id` (query) |

Archive uploads are auto-detected and extracted. Cross-org move/copy is triggered when `source_org_id` and `destination_org_id` differ.

Full Swagger documentation is available at the `/swagger/` endpoint.

---

## Docker Compose

MinIO is a core service — it starts with every `docker compose up`. No profiles are needed.

- **`minio`** — S3-compatible object storage (`minio/minio:latest`), volume: `minio_data`
- **`minio-init`** — one-shot container that creates the bucket using `mc` (MinIO client), restarts on failure until successful

The `django_app` service depends on `minio` being healthy before starting.
