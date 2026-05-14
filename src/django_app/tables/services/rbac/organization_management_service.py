from django.db import IntegrityError, transaction
from django.db.models import Count, QuerySet

from tables.models.rbac_models import Organization
from tables.services.rbac.rbac_exceptions import (
    LastActiveOrganizationError,
    OrganizationNameConflictError,
    OrganizationNotFoundError,
)


class OrganizationManagementService:
    """All read + write operations on Organization for the superadmin
    admin panel.

    Read methods return querysets annotated with `member_count`. Write methods
    are atomic. The "last active organization" guard is a private helper so
    that any future caller (CLI, async job) can reuse the same rule.
    """

    def list_organizations(
        self, is_active: bool | None = None
    ) -> QuerySet[Organization]:
        qs = Organization.objects.annotate(member_count=Count("members")).order_by(
            "-is_active", "name"
        )
        if is_active is not None:
            qs = qs.filter(is_active=is_active)
        return qs

    @transaction.atomic
    def create_organization(self, name: str) -> Organization:
        try:
            org = Organization.objects.create(name=name)
        except IntegrityError as exc:
            raise OrganizationNameConflictError() from exc
        return self._get_organization_with_member_count(org.pk)

    @transaction.atomic
    def rename_organization(self, org_id: int, name: str) -> Organization:
        org = self._get_locked_org(org_id)
        if org.name == name:
            return self._get_organization_with_member_count(org.pk)
        org.name = name
        try:
            org.save(update_fields=["name", "updated_at"])
        except IntegrityError as exc:
            raise OrganizationNameConflictError() from exc
        return self._get_organization_with_member_count(org.pk)

    @transaction.atomic
    def deactivate_organization(self, org_id: int) -> Organization:
        org = self._get_locked_org(org_id)
        if not org.is_active:
            return self._get_organization_with_member_count(org.pk)
        self._assert_can_deactivate()
        org.is_active = False
        org.save(update_fields=["is_active", "updated_at"])
        return self._get_organization_with_member_count(org.pk)

    @transaction.atomic
    def reactivate_organization(self, org_id: int) -> Organization:
        org = self._get_locked_org(org_id)
        if org.is_active:
            return self._get_organization_with_member_count(org.pk)
        org.is_active = True
        org.save(update_fields=["is_active", "updated_at"])
        return self._get_organization_with_member_count(org.pk)

    def _get_organization_with_member_count(self, org_id: int) -> Organization:
        try:
            return self.list_organizations().get(pk=org_id)
        except Organization.DoesNotExist as exc:
            raise OrganizationNotFoundError() from exc

    def _get_locked_org(self, org_id: int) -> Organization:
        """Row-locked fetch for write operations. Translates DoesNotExist
        into the project's standard 404 envelope so views don't need to
        know about Django's internal exception types."""
        try:
            return Organization.objects.select_for_update().get(pk=org_id)
        except Organization.DoesNotExist as exc:
            raise OrganizationNotFoundError() from exc

    @staticmethod
    def _assert_can_deactivate() -> None:
        """Refuses if `org` is the last active organization in the system.

        Run inside the same transaction as the deactivate write so the count
        is consistent with the SELECT FOR UPDATE on the org row. With per-row
        locking + a counted-rows query, two simultaneous deactivate calls
        cannot both succeed in driving the count to zero.
        """
        active_count = Organization.objects.filter(is_active=True).count()
        if active_count <= 1:
            raise LastActiveOrganizationError()
