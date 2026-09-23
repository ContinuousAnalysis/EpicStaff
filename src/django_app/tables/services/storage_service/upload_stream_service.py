import asyncio
import tempfile
import uuid

from asgiref.sync import sync_to_async
from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError
from tables.services.storage_service.archive_formats import ARCHIVE_SUFFIXES, is_archive_content
from tables.services.storage_service.archive_limits import ArchiveExtractionGuard
from tables.services.storage_service.path_utils import sanitize_storage_path
from tables.services.storage_service.quota_service import (
    StorageQuotaExceeded,
    commit_under_org_lock,
    remaining_quota,
)
from tables.validators.file_upload_validator import FileValidator


class UploadTooLarge(APIException):
    status_code = 413
    default_detail = "Uploaded file is too large."
    default_code = "upload_too_large"


_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.UPLOAD_MAX_CONCURRENCY)
    return _semaphore


def _org_key(org_id: int, rel: str) -> str:
    return f"org_{org_id}/{rel}"


def _safe_dir(path: str) -> str:
    """Normalize the target directory, rejecting anything that escapes the org root."""
    try:
        return sanitize_storage_path(path, allow_empty=True, allow_leading_slash=True)
    except ValueError as exc:
        raise ValidationError({"path": str(exc)}) from exc


def _strip_archive_suffix(filename: str) -> str:
    low = filename.lower()
    for sfx in sorted(ARCHIVE_SUFFIXES, key=len, reverse=True):
        if low.endswith(sfx):
            return filename[: -len(sfx)]
    return filename


def _default_backend():
    from tables.services.storage_service import get_storage_backend

    return get_storage_backend(organization_prefix="")


def _flat_rel(path: str, filename: str) -> str:
    """Canonical storage-relative path, used for BOTH the object key and the row.

    Normalizing only the key (and keeping the caller's spelling in the row) let
    "/etc/passwd" or "a//b.txt" write an object at one path and a StorageFile at
    another, littering the tree with phantom folders like "/" and "./".
    """
    if "/" in filename or "\\" in filename:
        raise ValidationError({"filename": "filename must not contain a path separator."})
    try:
        safe_name = sanitize_storage_path(filename, allow_empty=False)
    except ValueError as exc:
        raise ValidationError({"filename": str(exc)}) from exc
    safe_dir = _safe_dir(path)
    return f"{safe_dir}/{safe_name}" if safe_dir else safe_name


async def ingest_flat(
    org_id: int,
    path: str,
    filename: str,
    body_iter,
    declared_size: int | None,
    *,
    backend=None,
    validator: FileValidator | None = None,
) -> dict:
    """Stream a non-archive file straight into MinIO (bounded RAM), then commit."""
    backend = backend or _default_backend()
    validator = validator or FileValidator()
    validator.validate_name(filename, None)

    max_flat = settings.MAX_STREAM_UPLOAD_FILE_SIZE
    remaining = await sync_to_async(remaining_quota)(org_id)

    if declared_size is not None:
        if max_flat is not None and declared_size > max_flat:
            raise UploadTooLarge()
        if declared_size > remaining:
            raise StorageQuotaExceeded()

    rel = _flat_rel(path, filename)
    target_key = _org_key(org_id, rel)

    def size_guard(total: int) -> None:
        if max_flat is not None and total > max_flat:
            raise UploadTooLarge()
        if total > remaining:
            raise StorageQuotaExceeded()

    async with _get_semaphore():
        size = await backend.stream_upload(
            target_key, body_iter, part_size=settings.UPLOAD_PART_SIZE, size_guard=size_guard
        )
        try:
            await sync_to_async(commit_under_org_lock)(org_id, [(rel, size)])
        except Exception:
            await backend.delete_object_async(target_key)
            raise

    return {"path": rel, "size": size}


async def ingest_archive(
    org_id: int,
    path: str,
    filename: str,
    body_iter,
    *,
    backend=None,
    validator: FileValidator | None = None,
) -> dict:
    """Read the archive into a temp file (cap at MAX_ARCHIVE_FILE_SIZE), then
    validate/extract members into MinIO off the event loop."""
    backend = backend or _default_backend()
    validator = validator or FileValidator()
    _flat_rel(path, filename)  # reject a bad path/filename before reading the body

    cap = settings.MAX_ARCHIVE_FILE_SIZE
    with tempfile.SpooledTemporaryFile(max_size=cap + 1) as spooled:
        total = 0
        async for chunk in body_iter:
            total += len(chunk)
            if total > cap:
                raise UploadTooLarge()
            spooled.write(chunk)
        spooled.seek(0)

        async with _get_semaphore():
            try:
                return await asyncio.to_thread(
                    _process_archive_sync, org_id, path, filename, spooled, backend, validator
                )
            except ValueError as exc:
                # zip bomb, zip-slip, symlink member, encrypted or corrupt archive:
                # the caller sent a bad archive, so answer 400 with the reason instead
                # of letting it look like a server fault in the logs.
                raise ValidationError({"filename": str(exc)}) from exc


def _store_spooled_as_flat(org_id, path, filename, spooled, backend) -> dict:
    """Store an already-buffered file as a plain object, no extraction."""
    spooled.seek(0)
    max_flat = settings.MAX_STREAM_UPLOAD_FILE_SIZE
    rel = _flat_rel(path, filename)
    result = backend.upload(_org_key(org_id, rel), spooled)
    if max_flat is not None and result.size > max_flat:
        backend.delete(_org_key(org_id, rel))
        raise UploadTooLarge()
    try:
        commit_under_org_lock(org_id, [(rel, result.size)])
    except Exception:
        backend.delete(_org_key(org_id, rel))
        raise
    return {"path": rel, "size": result.size}


def _process_archive_sync(org_id, path, filename, spooled, backend, validator) -> dict:
    validator.validate_stream(spooled, filename, None)
    spooled.seek(0)

    # The archive/flat split is made on the file name before the body is read, so a
    # plain file carrying an archive extension (a text dump named .tar.gz, a truncated
    # download) lands here. Sniffing the buffered bytes the way the non-streaming
    # upload does keeps storing it as a file instead of failing the request.
    if not is_archive_content(spooled, filename=filename):
        return _store_spooled_as_flat(org_id, path, filename, spooled, backend)
    spooled.seek(0)

    remaining = remaining_quota(org_id)
    cap = min(settings.MAX_ARCHIVE_UNCOMPRESSED_SIZE, remaining)
    guard = ArchiveExtractionGuard(max_entries=settings.MAX_ARCHIVE_ENTRIES, max_total_bytes=cap)

    stem = sanitize_storage_path(_strip_archive_suffix(filename), allow_empty=False)
    safe_dir = _safe_dir(path)
    folder_name = f"{stem}-{uuid.uuid4().hex}"
    folder_rel = f"{safe_dir}/{folder_name}" if safe_dir else folder_name

    written: list[tuple[str, int]] = []
    try:
        for safe_name, reader in backend.iter_archive_members_streaming(spooled, guard):
            member_rel = f"{folder_rel}/{safe_name}"
            result = backend.upload(_org_key(org_id, member_rel), reader)
            written.append((member_rel, result.size))
        commit_under_org_lock(org_id, written)
    except Exception:
        backend.delete(_org_key(org_id, folder_rel))
        raise

    return {"path": folder_rel, "extracted": [rel for rel, _ in written]}
