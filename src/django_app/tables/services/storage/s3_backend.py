import io
import zipfile
from typing import Iterator

import boto3
from botocore.exceptions import ClientError

from tables.services.storage.base import AbstractStorageBackend


class S3StorageBackend(AbstractStorageBackend):
    """
    Storage backend for S3-compatible services (MinIO, AWS S3, etc.).

    Pass endpoint_url for MinIO or any non-AWS S3-compatible service.
    Leave endpoint_url as None to connect to AWS S3 directly.
    """

    def __init__(
        self,
        bucket_name: str,
        access_key: str,
        secret_key: str,
        organization_prefix: str = "org_1/",
        endpoint_url: str | None = None,
    ):
        self.bucket_name = bucket_name
        self.organization_prefix = organization_prefix
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )

    def _full_path(self, path: str) -> str:
        """Prepend the organization prefix to a caller-provided path."""
        return self.organization_prefix + path.lstrip("/")

    def _strip_prefix(self, full_key: str) -> str:
        """Remove the organization prefix from an S3 key."""
        if full_key.startswith(self.organization_prefix):
            return full_key[len(self.organization_prefix) :]
        return full_key

    def list_(self, prefix: str) -> list[dict]:
        full_prefix = self._full_path(prefix)
        if full_prefix and not full_prefix.endswith("/"):
            full_prefix += "/"

        paginator = self.client.get_paginator("list_objects_v2")
        results = []

        for page in paginator.paginate(
            Bucket=self.bucket_name,
            Prefix=full_prefix,
            Delimiter="/",
        ):
            for common_prefix in page.get("CommonPrefixes", []):
                folder_key = common_prefix["Prefix"]
                folder_name = folder_key.rstrip("/").split("/")[-1]
                results.append(
                    {
                        "name": folder_name,
                        "type": "folder",
                        "size": 0,
                        "modified": None,
                    }
                )

            for obj in page.get("Contents", []):
                if obj["Key"] == full_prefix:
                    continue
                file_name = obj["Key"].split("/")[-1]
                results.append(
                    {
                        "name": file_name,
                        "type": "file",
                        "size": obj["Size"],
                        "modified": obj["LastModified"].isoformat(),
                    }
                )

        return results

    def upload(self, path: str, file_object) -> dict:
        full_path = self._full_path(path)
        self.client.upload_fileobj(file_object, self.bucket_name, full_path)
        head = self.client.head_object(Bucket=self.bucket_name, Key=full_path)
        return {"path": path, "size": head["ContentLength"]}

    def download(self, path: str) -> bytes:
        full_path = self._full_path(path)
        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=full_path)
        except ClientError as error:
            if error.response["Error"]["Code"] == "NoSuchKey":
                raise FileNotFoundError(f"File does not exist: {path}")
            raise
        return response["Body"].read()

    def delete(self, path: str) -> None:
        full_path = self._full_path(path)

        # Attempt single-object delete first
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=full_path)
            self.client.delete_object(Bucket=self.bucket_name, Key=full_path)
            return
        except ClientError as error:
            if error.response["Error"]["Code"] != "404":
                raise

        # Treat as folder: delete all objects under the prefix
        prefix = full_path if full_path.endswith("/") else full_path + "/"
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
            objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
            if objects:
                self.client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={"Objects": objects},
                )

    def mkdir(self, path: str) -> None:
        full_path = self._full_path(path)
        if not full_path.endswith("/"):
            full_path += "/"
        self.client.put_object(Bucket=self.bucket_name, Key=full_path, Body=b"")

    def move(self, source_path: str, destination_path: str) -> None:
        self.copy(source_path, destination_path)
        self.delete(source_path)

    def copy(self, source_path: str, destination_path: str) -> None:
        full_source = self._full_path(source_path)
        full_destination = self._full_path(destination_path)

        # Single file: destination must differ from source
        if full_source.rstrip("/") == full_destination.rstrip("/"):
            raise ValueError(
                "Source and destination are the same path — cannot copy to itself."
            )

        copy_source = {"Bucket": self.bucket_name, "Key": full_source}

        # Check if source is a single object
        if self.exists(source_path):
            self.client.copy_object(
                CopySource=copy_source,
                Bucket=self.bucket_name,
                Key=full_destination,
            )
            return

        # Try as a folder prefix
        source_prefix = full_source if full_source.endswith("/") else full_source + "/"
        # Preserve the source folder name inside the destination.
        # e.g. copy("dir/", "temp_dir/") -> temp_dir/dir/<contents>
        source_folder_name = full_source.rstrip("/").split("/")[-1]
        dest_base = full_destination.rstrip("/") + "/" + source_folder_name

        # Folder copy into its own parent resolves to the same path
        if dest_base.rstrip("/") == full_source.rstrip("/"):
            raise ValueError(
                "Source and destination are the same path — cannot copy to itself."
            )

        copied = False
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket_name, Prefix=source_prefix):
            for obj in page.get("Contents", []):
                relative = obj["Key"][len(source_prefix) :]
                destination_key = dest_base + "/" + relative
                self.client.copy_object(
                    CopySource={"Bucket": self.bucket_name, "Key": obj["Key"]},
                    Bucket=self.bucket_name,
                    Key=destination_key,
                )
                copied = True

        if not copied:
            raise FileNotFoundError(f"Source path does not exist: {source_path}")

    def info(self, path: str) -> dict:
        full_path = self._full_path(path)
        try:
            head = self.client.head_object(Bucket=self.bucket_name, Key=full_path)
        except ClientError as error:
            if error.response["Error"]["Code"] == "404":
                raise FileNotFoundError(f"File does not exist: {path}")
            raise
        name = path.rstrip("/").split("/")[-1]
        return {
            "name": name,
            "path": path,
            "size": head["ContentLength"],
            "content_type": head.get("ContentType", "application/octet-stream"),
            "modified": head["LastModified"].isoformat(),
        }

    def exists(self, path: str) -> bool:
        full_path = self._full_path(path)
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=full_path)
            return True
        except ClientError as error:
            if error.response["Error"]["Code"] == "404":
                return False
            raise

    def download_zip(self, paths: list[str]) -> Iterator[bytes]:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in paths:
                file_bytes = self.download(path)
                archive_name = path.lstrip("/")
                archive.writestr(archive_name, file_bytes)
        buffer.seek(0)
        yield buffer.read()

    def upload_archive(self, prefix: str, archive_file) -> list[str]:
        extracted_paths = []
        for relative_path, file_bytes in self._iter_archive_entries(archive_file):
            destination_path = prefix.rstrip("/") + "/" + relative_path
            self.upload(destination_path, io.BytesIO(file_bytes))
            extracted_paths.append(destination_path)
        return extracted_paths
