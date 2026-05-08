from django.contrib.auth import get_user_model

from tables.models.rbac_models import OrganizationUser, Role
from tables.models.rbac_models.rbac_enums import BuiltInRole
from tables.services.rbac.rbac_exceptions import (
    InvalidRoleAssignmentError,
    LastOrgAdminError,
    LastSuperadminError,
)


class UserManagementGuards:
    """Pure invariant checks for Story 5.

    Static methods so they can be called without instance state. Each
    method is intended to run inside a service-level `transaction.atomic()`
    *after* the contested row has been `select_for_update()`-locked. The
    row lock + same-transaction count is what makes the checks race-safe;
    these methods themselves do not acquire locks.
    """

    @staticmethod
    def assert_not_last_active_superadmin(target_user) -> None:
        """Refuses if target_user is the only User row with
        is_superadmin=True AND is_active=True.

        Caller must have already SELECT FOR UPDATE'd the target_user row.
        """
        UserModel = get_user_model()
        if not (target_user.is_superadmin and target_user.is_active):
            return  # not currently a counting superadmin → revoke is a no-op
        active_superadmin_count = UserModel.objects.filter(
            is_superadmin=True, is_active=True
        ).count()
        if active_superadmin_count <= 1:
            raise LastSuperadminError()

    @staticmethod
    def assert_not_last_org_admin(org_id: int, excluding_user_id: int) -> None:
        """Refuses if no Org Admin remains in `org_id` after notionally
        excluding `excluding_user_id` from the count.

        Caller must have already SELECT FOR UPDATE'd the target
        OrganizationUser row.
        """
        remaining_org_admins = (
            OrganizationUser.objects.filter(
                org_id=org_id, role__name=BuiltInRole.ORG_ADMIN
            )
            .exclude(user_id=excluding_user_id)
            .count()
        )
        if remaining_org_admins == 0:
            raise LastOrgAdminError()

    @staticmethod
    def assert_batch_preserves_org_admin(
        current_org_admin_user_ids: set,
        batch: list,
    ) -> None:
        """Refuses if applying `batch` to the org would leave it with zero
        Org Admins, when it currently has at least one.

        `batch` is a list of (user_id, new_role_name) tuples representing
        the post-batch role for every row in the assignment. Users not in
        the batch keep their current role. The caller is expected to have
        SELECT FOR UPDATE-locked the Org row and the affected
        OrganizationUser rows before invoking this guard.

        No-op when the org currently has no Org Admins — the batch is not
        responsible for repairing a pre-existing broken state.
        """
        if not current_org_admin_user_ids:
            return

        batch_user_ids = {user_id for user_id, _ in batch}
        new_org_admins_in_batch = {
            user_id
            for user_id, role_name in batch
            if role_name == BuiltInRole.ORG_ADMIN
        }

        final_org_admins = (
            current_org_admin_user_ids - batch_user_ids
        ) | new_org_admins_in_batch

        if not final_org_admins:
            raise LastOrgAdminError()

    @staticmethod
    def assert_role_is_assignable(role: Role, org_id: int) -> None:
        """Refuses to assign roles that are not valid membership targets:

        - The global Superadmin role (`is_built_in=True, name='Superadmin'`)
          — superadmin is a User flag granted via grant-superadmin, never
          an org-membership role.
        - A custom role whose `org_id` is not None and != the target org.
          (Story 9 forward-compat; for Story 5 there are no custom roles
          but the guard is in place.)
        """
        if role.is_built_in and role.name == BuiltInRole.SUPERADMIN:
            raise InvalidRoleAssignmentError()
        if role.org_id is not None and role.org_id != org_id:
            raise InvalidRoleAssignmentError()
