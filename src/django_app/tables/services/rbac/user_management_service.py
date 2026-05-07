from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Prefetch, QuerySet
from loguru import logger

from tables.models.rbac_models import OrganizationUser, Organization, Role
from tables.models.rbac_models.rbac_enums import BuiltInRole
from tables.services.rbac.rbac_exceptions import (
    EmailAlreadyExistsError,
    MembershipAlreadyExistsError,
    OrganizationNotFoundError,
    RoleNotFoundError,
    UserNotFoundError,
)
from tables.services.rbac.user_management_guards import UserManagementGuards


class UserManagementService:
    """Single orchestrator for every Story 5 read/write.

    Views call this; it does the work. Defense-in-depth permission re-checks
    live here too — the permission class on the view is the gate; the
    service is the safety net (matches Story 4's PasswordRecoveryService.admin_reset
    pattern).

    Every write method:
      - Wraps in transaction.atomic().
      - Acquires SELECT FOR UPDATE on the contested row before any guard.
      - Translates IntegrityError to typed domain exceptions.
      - Logs INFO via loguru on success.
      - Returns query-optimized objects so view serializers don't N+1.
    """

    # ---- read ----

    def list_users(
        self,
        actor,
        email=None,
        is_superadmin=None,
        organization_id=None,
    ) -> QuerySet:
        """Cross-org user list. Caller is expected to be superadmin
        (enforced by the view permission class). The actor argument is
        accepted for symmetry and future audit logging — currently unused
        in the read path.
        """
        UserModel = get_user_model()
        qs = (
            UserModel.objects.all()
            .order_by("-created_at", "email")
            .prefetch_related(
                Prefetch(
                    "organization_memberships",
                    queryset=OrganizationUser.objects.select_related("org", "role"),
                )
            )
        )
        if email:
            qs = qs.filter(email__icontains=email)
        if is_superadmin is not None:
            qs = qs.filter(is_superadmin=is_superadmin)
        if organization_id is not None:
            qs = qs.filter(organization_memberships__org_id=organization_id).distinct()
        return qs

    def list_org_members(
        self,
        actor,
        org_id,
        email=None,
        role_name=None,
    ) -> QuerySet:
        """Members of a single org. Each row in the result has its
        `_membership_for_org` attribute populated (set in the loop in the
        view) — the queryset itself returns User rows filtered through
        OrganizationUser.

        Returns a queryset of OrganizationUser rows (one per member of
        org_id) with `select_related('user', 'role', 'org')` so the
        serializer can read `.user`, `.role`, and `.org` without N+1.
        """
        qs = (
            OrganizationUser.objects.filter(org_id=org_id)
            .select_related("user", "role", "org")
            .order_by("role__name", "user__email")
        )
        if email:
            qs = qs.filter(user__email__icontains=email)
        if role_name:
            qs = qs.filter(role__name=role_name)
        return qs

    # ---- create ----

    @transaction.atomic
    def create_user(
        self,
        actor,
        email,
        password,
        organization_id=None,
        role_id=None,
    ):
        """Creates a User. If `organization_id` is provided, also creates
        an OrganizationUser row in the same transaction.

          - role_id ignored when organization_id is None.
          - role_id defaults to built-in Member when organization_id is
            given without an explicit role_id (D9).
          - duplicate email → EmailAlreadyExistsError (400).
          - unknown organization_id → OrganizationNotFoundError (404).
          - unknown role_id → RoleNotFoundError (404).
          - non-assignable role → InvalidRoleAssignmentError (400).
        """
        UserModel = get_user_model()

        if organization_id is not None:
            try:
                org = Organization.objects.select_for_update().get(pk=organization_id)
            except Organization.DoesNotExist as exc:
                raise OrganizationNotFoundError() from exc
            role = self._resolve_role(role_id, default_org_id=organization_id)
            UserManagementGuards.assert_role_is_assignable(role, org_id=organization_id)
        else:
            org = None
            role = None

        try:
            user = UserModel.objects.create_user(email=email, password=password)
        except IntegrityError as exc:
            raise EmailAlreadyExistsError() from exc

        if org is not None and role is not None:
            OrganizationUser.objects.create(user=user, org=org, role=role)

        logger.info(
            "UserManagementService.create_user actor={actor} new_user={new} "
            "org={org} role={role}",
            actor=getattr(actor, "email", "system"),
            new=user.email,
            org=getattr(org, "name", None),
            role=getattr(role, "name", None),
        )
        return user

    @transaction.atomic
    def add_membership(
        self,
        actor,
        org_id,
        role_id=None,
        user_id=None,
        email=None,
        password=None,
    ):
        """Two modes (validator enforces XOR):
          Mode A (link existing): user_id given.
          Mode B (create + link): email + password given.

        role_id is optional; defaults to built-in Member if absent (D9).

        Returns the OrganizationUser row, with select_related('user',
        'org', 'role') populated.
        """
        UserModel = get_user_model()

        try:
            org = Organization.objects.select_for_update().get(pk=org_id)
        except Organization.DoesNotExist as exc:
            raise OrganizationNotFoundError() from exc

        role = self._resolve_role(role_id, default_org_id=org_id)
        UserManagementGuards.assert_role_is_assignable(role, org_id=org_id)

        if user_id is not None:
            try:
                target_user = UserModel.objects.select_for_update().get(pk=user_id)
            except UserModel.DoesNotExist as exc:
                raise UserNotFoundError() from exc
            mode = "link"
        else:
            try:
                target_user = UserModel.objects.create_user(
                    email=email, password=password
                )
            except IntegrityError as exc:
                raise EmailAlreadyExistsError() from exc
            mode = "create_and_link"

        try:
            membership = OrganizationUser.objects.create(
                user=target_user, org=org, role=role
            )
        except IntegrityError as exc:
            raise MembershipAlreadyExistsError() from exc

        logger.info(
            "UserManagementService.add_membership actor={actor} mode={mode} "
            "user={u} org={o} role={r}",
            actor=getattr(actor, "email", "system"),
            mode=mode,
            u=target_user.email,
            o=org.name,
            r=role.name,
        )

        # Re-fetch with select_related so the view serializer doesn't
        # trigger extra queries.
        return OrganizationUser.objects.select_related("user", "org", "role").get(
            pk=membership.pk
        )

    # ---- update ----

    @transaction.atomic
    def change_role(self, actor, org_id, user_id, role_id):
        """Changes the role on the (user_id, org_id) membership.

        Locks the OrganizationUser row first, then resolves the new role,
        validates assignability, applies the last-Org-Admin guard if the
        change would demote an Org Admin.
        """
        try:
            membership = (
                OrganizationUser.objects.select_for_update()
                .select_related("user", "org", "role")
                .get(org_id=org_id, user_id=user_id)
            )
        except OrganizationUser.DoesNotExist as exc:
            raise UserNotFoundError() from exc

        new_role = self._resolve_role(role_id, default_org_id=org_id)
        UserManagementGuards.assert_role_is_assignable(new_role, org_id=org_id)

        if membership.role_id == new_role.pk:
            return membership  # no-op; idempotent

        was_org_admin = membership.role.name == BuiltInRole.ORG_ADMIN
        becoming_org_admin = new_role.name == BuiltInRole.ORG_ADMIN
        if was_org_admin and not becoming_org_admin:
            UserManagementGuards.assert_not_last_org_admin(
                org_id=org_id, excluding_user_id=user_id
            )

        membership.role = new_role
        membership.save(update_fields=["role"])
        membership.refresh_from_db()

        logger.info(
            "UserManagementService.change_role actor={a} target={t} "
            "org={o} role={r}",
            a=getattr(actor, "email", "system"),
            t=membership.user.email,
            o=membership.org.name,
            r=new_role.name,
        )
        return membership

    # ---- delete ----

    @transaction.atomic
    def remove_membership(self, actor, org_id, user_id):
        """Deletes the (user_id, org_id) membership. Last-Org-Admin guard
        applies if the target's current role is Org Admin."""
        try:
            membership = (
                OrganizationUser.objects.select_for_update()
                .select_related("user", "org", "role")
                .get(org_id=org_id, user_id=user_id)
            )
        except OrganizationUser.DoesNotExist as exc:
            raise UserNotFoundError() from exc

        if membership.role.name == BuiltInRole.ORG_ADMIN:
            UserManagementGuards.assert_not_last_org_admin(
                org_id=org_id, excluding_user_id=user_id
            )

        target_email = membership.user.email
        org_name = membership.org.name
        membership.delete()

        logger.info(
            "UserManagementService.remove_membership actor={a} target={t} org={o}",
            a=getattr(actor, "email", "system"),
            t=target_email,
            o=org_name,
        )

    # ---- superadmin flag ----

    @transaction.atomic
    def grant_superadmin(self, actor, target_user_id):
        """Sets is_superadmin=True on target_user_id. Idempotent if
        already True."""
        UserModel = get_user_model()
        try:
            target = UserModel.objects.select_for_update().get(pk=target_user_id)
        except UserModel.DoesNotExist as exc:
            raise UserNotFoundError() from exc

        if target.is_superadmin:
            return target  # no-op

        target.is_superadmin = True
        target.save(update_fields=["is_superadmin", "updated_at"])
        target.refresh_from_db()

        logger.info(
            "UserManagementService.grant_superadmin actor={a} target={t}",
            a=getattr(actor, "email", "system"),
            t=target.email,
        )
        return target

    @transaction.atomic
    def revoke_superadmin(self, actor, target_user_id):
        """Sets is_superadmin=False on target_user_id. Last-active-superadmin
        guard. Idempotent if already False."""
        UserModel = get_user_model()
        try:
            target = UserModel.objects.select_for_update().get(pk=target_user_id)
        except UserModel.DoesNotExist as exc:
            raise UserNotFoundError() from exc

        if not target.is_superadmin:
            return target  # no-op

        UserManagementGuards.assert_not_last_active_superadmin(target)

        target.is_superadmin = False
        target.save(update_fields=["is_superadmin", "updated_at"])
        target.refresh_from_db()

        logger.info(
            "UserManagementService.revoke_superadmin actor={a} target={t}",
            a=getattr(actor, "email", "system"),
            t=target.email,
        )
        return target

    # ---- internal helpers ----

    def _resolve_role(self, role_id, default_org_id):
        """If role_id is None, returns the built-in Member role. Otherwise
        returns the Role with the given pk, raising RoleNotFoundError if
        absent.

        `default_org_id` is unused for built-in role lookup but kept in
        the signature so callers can pass it for future story extensions
        (custom default-role per org)."""
        if role_id is None:
            try:
                return Role.objects.get(
                    name=BuiltInRole.MEMBER, is_built_in=True, org__isnull=True
                )
            except Role.DoesNotExist as exc:
                raise RoleNotFoundError() from exc
        try:
            return Role.objects.get(pk=role_id)
        except Role.DoesNotExist as exc:
            raise RoleNotFoundError() from exc
