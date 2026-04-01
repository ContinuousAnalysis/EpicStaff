from abc import ABC, abstractmethod
from typing import Iterator


class AbstractStorageBackend(ABC):
    @abstractmethod
    def list(self, prefix: str) -> list[dict]:
        """List files and folders at prefix. Returns [{name, type, size, modified}]."""

    @abstractmethod
    def upload(self, path: str, file_object) -> dict:
        """Upload file_object to path. Returns {path, size}."""

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
    def copy(self, source_path: str, destination_path: str) -> None:
        """Copy file or folder."""

    @abstractmethod
    def info(self, path: str) -> dict:
        """Return {name, size, content_type, modified}."""

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Return True if the path exists."""

    @abstractmethod
    def download_zip(self, paths: list[str]) -> Iterator[bytes]:
        """Yield a streaming zip archive containing the given paths."""

    @abstractmethod
    def upload_archive(self, prefix: str, zip_file) -> list[str]:
        """Extract zip into prefix. Returns list of extracted relative paths."""
