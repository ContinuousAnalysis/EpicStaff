from dataclasses import dataclass
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction

from tables.models.rbac_models import (
    Organization,
    OrganizationUser,
    Role,
)
from tables.services.rbac.rbac_exceptions import SetupAlreadyCompletedError


@dataclass
class SetupResult:
    user: "User"
    organization: Organization
    membership: OrganizationUser


class FirstSetupService:
    """
    Bootstrap the very first superadmin and their default organization.

    - `is_setup_required()` returns True if no User row exists.
    - `setup(...)` is atomic and idempotent-checked: it refuses if any user
      already exists ("When this setup is completed once, it never
      appears again" — re-opens only if all users are removed).
    """

    ORG_ADMIN_ROLE_NAME = "Org Admin"

    def is_setup_required(self) -> bool:
        return not get_user_model().objects.exists()

    @transaction.atomic
    def setup(
        self,
        *,
        email: str,
        password: str,
        organization_name: str,
        display_name: Optional[str] = None,
    ) -> SetupResult:
        user_model = get_user_model()

        if user_model.objects.exists():
            raise SetupAlreadyCompletedError()

        user = user_model.objects.create_superuser(
            email=email,
            password=password,
            display_name=display_name,
        )

        organization = Organization.objects.create(name=organization_name)

        # Superadmin bypasses permission checks globally via `is_superadmin`,
        # but per Story 1 spec they also get the Org Admin role in the default
        # org so the UI sees a consistent membership record.
        org_admin_role = Role.objects.get(
            name=self.ORG_ADMIN_ROLE_NAME, is_built_in=True, org__isnull=True
        )
        membership = OrganizationUser.objects.create(
            user=user, org=organization, role=org_admin_role
        )

        return SetupResult(user=user, organization=organization, membership=membership)
