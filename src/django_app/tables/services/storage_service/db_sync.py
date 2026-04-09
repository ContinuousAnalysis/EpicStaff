from django.db import transaction
from django.db.models import Value
from django.db.models.functions import Concat, Substr


class StorageFileSync:
    """
    Keeps the StorageFile DB table in sync with storage mutations.
    All path arguments are org-relative (no org_X/ prefix).
    """

    @staticmethod
    def on_upload(org_id: int, path: str) -> None:
        from tables.models import Organization, StorageFile

        org = Organization.objects.get(id=org_id)
        StorageFile.objects.get_or_create(org=org, path=path)

    @staticmethod
    def on_delete(org_id: int, path: str) -> None:
        from tables.models import StorageFile

        deleted, _ = StorageFile.objects.filter(org_id=org_id, path=path).delete()
        if deleted == 0:
            # It was a folder — delete all files under that prefix
            prefix = path.rstrip("/") + "/"
            StorageFile.objects.filter(org_id=org_id, path__startswith=prefix).delete()

    @staticmethod
    def on_move(org_id: int, src: str, dst: str) -> None:
        from tables.models import StorageFile

        with transaction.atomic():
            updated = StorageFile.objects.filter(org_id=org_id, path=src).update(
                path=dst
            )
            if updated == 0:
                # It was a folder — bulk-update all paths under the prefix
                src_prefix = src.rstrip("/") + "/"
                dst_prefix = dst.rstrip("/") + "/"

                StorageFile.objects.filter(
                    org_id=org_id, path__startswith=src_prefix
                ).update(
                    path=Concat(Value(dst_prefix), Substr("path", len(src_prefix) + 1))
                )

    @staticmethod
    def on_copy(org_id: int, actual_dst_paths: list[str]) -> None:
        from tables.models import Organization, StorageFile

        org = Organization.objects.get(id=org_id)
        StorageFile.objects.bulk_create(
            [StorageFile(org=org, path=p) for p in actual_dst_paths],
            ignore_conflicts=True,
        )

    @staticmethod
    def on_move_cross_org(
        src_org_id: int, src_path: str, dst_org_id: int, dst_path: str
    ) -> None:
        from tables.models import Organization, StorageFile

        StorageFile.objects.filter(org_id=src_org_id, path=src_path).delete()
        dst_org = Organization.objects.get(id=dst_org_id)
        StorageFile.objects.get_or_create(org=dst_org, path=dst_path)

    @staticmethod
    def on_copy_cross_org(dst_org_id: int, dst_path: str) -> None:
        from tables.models import Organization, StorageFile

        dst_org = Organization.objects.get(id=dst_org_id)
        StorageFile.objects.get_or_create(org=dst_org, path=dst_path)
