from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import APIException
from tables.models import Organization, StorageFile
from tables.services.storage_service.db_sync import StorageFileSync


class StorageQuotaExceeded(APIException):
    status_code = 413
    default_detail = "Storage quota exceeded for this organization."
    default_code = "storage_quota_exceeded"


def get_org_storage_usage(org_id: int) -> int:
    return StorageFile.objects.filter(org_id=org_id).aggregate(s=Sum("size"))["s"] or 0


def remaining_quota(org_id: int) -> int:
    return max(0, settings.ORG_STORAGE_QUOTA - get_org_storage_usage(org_id))


def check_quota(org_id: int, size: int) -> None:
    if size > remaining_quota(org_id):
        raise StorageQuotaExceeded()


def commit_under_org_lock(org_id: int, additions: list) -> None:
    """Serialize quota re-check + row writes per org (no I/O inside the lock), so
    concurrent uploads for one org cannot jointly overrun. additions=[(rel, size)]."""
    total = sum(s for _, s in additions)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=org_id)
        if total > remaining_quota(org_id):
            raise StorageQuotaExceeded()
        for rel, size in additions:
            StorageFileSync.on_upload(org_id, rel, size=size)
