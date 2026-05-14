from rest_framework.permissions import BasePermission


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
