from rest_framework.permissions import BasePermission

from tables.models.rbac_models import OrganizationUser
from tables.models.rbac_models.rbac_enums import BuiltInRole


class IsSuperadmin(BasePermission):
    """Allows access only to authenticated users with `is_superadmin=True`.

    Pair with `IsAuthenticated` so anonymous callers get 401 (not 403). When
    this class denies, DRF raises `PermissionDenied`, which
    `custom_exception_handler` formats as the project-standard 403 envelope:

        {"status_code": 403, "code": "permission_denied", "message": "..."}
    """

    message = "Superadmin privileges are required for this action."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user and user.is_authenticated and getattr(user, "is_superadmin", False)
        )


class IsSuperadminOrOrgAdmin(BasePermission):
    """Allows authenticated users with `is_superadmin=True` globally, OR
    users who hold the built-in `Org Admin` role for the organization
    identified by `view.kwargs['org_id']`.

    Pair with `IsAuthenticated` so anonymous callers get 401 (not 403).
    Service layer re-checks the same membership inside its transaction
    as defense-in-depth.

    Returns False if `org_id` is not in `view.kwargs` — endpoints using
    this class must declare `org_id` as a URL path parameter.
    """

    message = "Superadmin or Org Admin privileges are required for this action."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        if getattr(user, "is_superadmin", False):
            return True
        org_id = view.kwargs.get("org_id")
        if not org_id:
            return False
        return OrganizationUser.objects.filter(
            user=user,
            org_id=org_id,
            role__name=BuiltInRole.ORG_ADMIN,
        ).exists()
