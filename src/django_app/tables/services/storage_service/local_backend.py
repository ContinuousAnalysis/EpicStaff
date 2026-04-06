import io
import mimetypes
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from tables.services.storage_service.base import AbstractStorageBackend
from tables.services.storage_service.dataclasses import (
    FileInfo,
    FileListItem,
    UploadResult,
)


class LocalStorageBackend(AbstractStorageBackend):
    """
    Storage backend using the local filesystem.

    Intended for development/testing without MinIO. All files are stored
    under base_path / organization_prefix / caller_path.
    """

    def __init__(self, root: str, organization_prefix: str = "org_1/"):
        self.base_path = Path(root) / organization_prefix
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        """Resolve a caller-provided path to an absolute filesystem path."""
        resolved = (self.base_path / path.lstrip("/")).resolve()
        if not str(resolved).startswith(str(self.base_path.resolve())):
            raise PermissionError(f"Path traversal detected: {path}")
        return resolved

    def list_(self, prefix: str) -> list[FileListItem]:
        directory = self._resolve(prefix)
        if not directory.exists() or not directory.is_dir():
            return []

        results: list[FileListItem] = []
        for entry in sorted(directory.iterdir()):
            stat = entry.stat()
            modified = datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat()
            if entry.is_dir():
                is_empty = not any(entry.iterdir())
                results.append(
                    FileListItem(
                        name=entry.name,
                        type="folder",
                        size=0,
                        modified=modified,
                        is_empty=is_empty,
                    )
                )
            else:
                results.append(
                    FileListItem(
                        name=entry.name,
                        type="file",
                        size=stat.st_size,
                        modified=modified,
                        is_empty=False,
                    )
                )
        return results

    def upload(self, path: str, file_object) -> UploadResult:
        destination = self._resolve(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        file_bytes = file_object.read()
        destination.write_bytes(file_bytes)
        return UploadResult(path=path, size=len(file_bytes))

    def download(self, path: str) -> bytes:
        return self._resolve(path).read_bytes()

    def delete(self, path: str) -> None:
        target = self._resolve(path)
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()

    def mkdir(self, path: str) -> None:
        self._resolve(path).mkdir(parents=True, exist_ok=True)

    def move(self, source_path: str, destination_path: str) -> None:
        source = self._resolve(source_path)
        destination = self._resolve(destination_path)
        if not source.exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")
        # If destination is an existing directory, move source into it
        if destination.is_dir():
            shutil.move(str(source), str(destination / source.name))
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(destination))

    def rename(self, source_path: str, destination_path: str) -> None:
        source = self._resolve(source_path)
        destination = self._resolve(destination_path)
        if not source.exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")
        if destination.exists():
            raise FileExistsError(f"Destination already exists: {destination_path}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))

    def copy(self, source_path: str, destination_path: str) -> None:
        source = self._resolve(source_path)
        destination = self._resolve(destination_path)
        if not source.exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")
        if source.is_dir():
            # Copy source folder into destination: /dest/source_name/...
            target = destination / source.name if destination.is_dir() else destination
            shutil.copytree(str(source), str(target))
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(source), str(destination))

    def info(self, path: str) -> FileInfo:
        target = self._resolve(path)
        stat = target.stat()
        content_type, _ = mimetypes.guess_type(target.name)
        modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        return FileInfo(
            name=target.name,
            path=path,
            size=stat.st_size,
            content_type=content_type or "application/octet-stream",
            modified=modified,
        )

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()

    def download_zip(self, paths: list[str]) -> Iterator[bytes]:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                file_bytes = self.download(path)
                archive.writestr(path.lstrip("/"), file_bytes)
        buffer.seek(0)
        yield buffer.read()

    def upload_archive(self, prefix: str, archive_file) -> list[str]:
        target_directory = self._resolve(prefix)
        target_directory.mkdir(parents=True, exist_ok=True)
        extracted_paths = []
        for relative_path, file_bytes in self._iter_archive_entries(archive_file):
            destination = target_directory / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(file_bytes)
            extracted_paths.append(prefix.rstrip("/") + "/" + relative_path)
        return extracted_paths
