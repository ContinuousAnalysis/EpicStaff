import pytest
from django.test import override_settings

from tables.models import Organization, StorageFile
from tables.services.storage_service.quota_service import (
    StorageQuotaExceeded,
    check_quota,
    commit_under_org_lock,
    get_org_storage_usage,
    remaining_quota,
)


@pytest.mark.django_db
def test_usage_sums_only_file_sizes():
    org = Organization.objects.create(name="Acme")
    StorageFile.objects.create(org=org, path="a", name="a", item_type="file", size=100)
    StorageFile.objects.create(org=org, path="d", name="d", item_type="folder", size=None)
    assert get_org_storage_usage(org.id) == 100


@pytest.mark.django_db
@override_settings(ORG_STORAGE_QUOTA=1000)
def test_check_and_commit():
    org = Organization.objects.create(name="Acme")
    StorageFile.objects.create(org=org, path="a", name="a", item_type="file", size=900)
    assert remaining_quota(org.id) == 100
    with pytest.raises(StorageQuotaExceeded):
        check_quota(org.id, 200)
    commit_under_org_lock(org.id, [("b.txt", 50)])
    assert StorageFile.objects.get(org=org, path="b.txt").size == 50
    with pytest.raises(StorageQuotaExceeded):
        commit_under_org_lock(org.id, [("c.txt", 100)])
