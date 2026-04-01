import os

from django.conf import settings

from tables.services.storage.base import AbstractStorageBackend
from tables.services.storage.local_backend import LocalStorageBackend
from tables.services.storage.s3_backend import S3StorageBackend


def get_storage_backend(organization_prefix: str = "org_1/") -> AbstractStorageBackend:
    """
    Return the configured storage backend scoped to the given organization prefix.

    Backend type is controlled by the STORAGE_BACKEND environment variable:
      - "s3"    — S3StorageBackend (works with MinIO and AWS S3)
      - "local" — LocalStorageBackend (local filesystem, for testing)
    """
    backend_type = os.getenv("STORAGE_BACKEND", "s3")

    if backend_type == "local":
        return LocalStorageBackend(
            root=settings.STORAGE_LOCAL_ROOT,
            organization_prefix=organization_prefix,
        )

    return S3StorageBackend(
        endpoint_url=settings.STORAGE_ENDPOINT or None,
        access_key=settings.STORAGE_ACCESS_KEY,
        secret_key=settings.STORAGE_SECRET_KEY,
        bucket_name=settings.STORAGE_BUCKET_NAME,
        organization_prefix=organization_prefix,
    )
