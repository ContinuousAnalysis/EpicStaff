import tarfile
import zipfile
from abc import ABC, abstractmethod
from typing import Iterator

from tables.services.storage_service.dataclasses import (
    FileInfo,
    FileListItem,
    UploadResult,
)


class AbstractStorageBackend(ABC):
    def _iter_archive_entries(self, archive_file) -> Iterator[tuple[str, bytes]]:
        """
        Yield (relative_path, bytes) for every file inside a ZIP or TAR archive.
        Supports .zip, .tar, .tar.gz, .tar.bz2, .tar.xz (anything the stdlib handles).
        Raises ValueError for unrecognised formats.
        """
        pos = archive_file.tell()

        if zipfile.is_zipfile(archive_file):
            archive_file.seek(pos)
            with zipfile.ZipFile(archive_file, "r") as zf:
                for entry in zf.infolist():
                    if not entry.is_dir():
                        yield entry.filename, zf.read(entry.filename)
            return

        archive_file.seek(pos)
        try:
            is_tar = tarfile.is_tarfile(archive_file)
        except Exception:
            is_tar = False

        if is_tar:
            archive_file.seek(pos)
            with tarfile.open(fileobj=archive_file, mode="r:*") as tf:
                for member in tf.getmembers():
                    if member.isfile():
                        fobj = tf.extractfile(member)
                        if fobj:
                            yield member.name, fobj.read()
            return

        archive_file.seek(pos)
        raise ValueError("Unsupported archive format — expected ZIP or TAR")

    @abstractmethod
    def list_(self, prefix: str) -> list[FileListItem]:
        """List files and folders at prefix."""

    @abstractmethod
    def upload(self, path: str, file_object) -> UploadResult:
        """Upload file_object to path."""

    @abstractmethod
    def download(self, path: str) -> bytes:
        """Return file content as bytes."""

    @abstractmethod
    def delete(self, path: str) -> None:
        """Delete file or folder (folder = recursive)."""

    @abstractmethod
    def mkdir(self, path: str) -> None:
        """Create a folder."""

    @abstractmethod
    def move(self, source_path: str, destination_path: str) -> None:
        """Move / rename file or folder."""

    @abstractmethod
    def rename(self, source_path: str, destination_path: str) -> None:
        """Rename/move source to the exact destination path (never into it)."""

    @abstractmethod
    def copy(self, source_path: str, destination_path: str) -> None:
        """Copy file or folder."""

    @abstractmethod
    def info(self, path: str) -> FileInfo:
        """Return file metadata."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Return True if the path exists."""

    @abstractmethod
    def download_zip(self, paths: list[str]) -> Iterator[bytes]:
        """Yield a streaming zip archive containing the given paths."""

    @abstractmethod
    def upload_archive(self, prefix: str, archive_file) -> list[str]:
        """Extract archive (ZIP or TAR) into prefix. Returns list of extracted relative paths."""
