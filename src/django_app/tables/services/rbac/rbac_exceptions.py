from tables.exceptions import CustomAPIExeption


class FormValidationError(CustomAPIExeption):
    """Raised by AuthValidationService when one or more submitted fields
    fail validation. Carries a structured `errors` list (populated by the
    service) which `custom_exception_handler` surfaces under the `errors`
    key of the response body.

    Each entry in `errors` has shape:
        {"field": str, "value": Any, "reason": str}

    Sensitive submitted values (password, refresh, token) are redacted by
    the service before they reach this exception.
    """

    status_code = 400
    default_detail = "Validation failed"
    default_code = "invalid"

    def __init__(self, errors: list[dict], detail=None):
        self.errors = errors
        super().__init__(detail=detail or self.default_detail)


class SetupAlreadyCompletedError(CustomAPIExeption):
    """Raised by FirstSetupService when setup has already been performed."""

    status_code = 409
    default_detail = "Setup has already been completed"
    default_code = "setup_already_completed"


class InvalidRefreshTokenError(CustomAPIExeption):
    """Raised by LogoutView when a refresh token is missing, malformed,
    expired, or already blacklisted."""

    status_code = 400
    default_detail = "Refresh token is invalid, expired, or already revoked."
    default_code = "invalid_or_expired_refresh"


class InvalidSseTicketError(CustomAPIExeption):
    """Raised when a ?ticket= query param on an SSE endpoint does not
    resolve to a live single-use ticket in cache."""

    status_code = 401
    default_detail = "Invalid or expired SSE ticket."
    default_code = "invalid_sse_ticket"


class InvalidOrExpiredTokenError(CustomAPIExeption):
    """Raised by PasswordRecoveryService.confirm_reset when the submitted
    token is unknown, already used, or past its TTL. The message is
    intentionally generic so the caller cannot distinguish between those
    cases and cannot probe token validity.
    """

    status_code = 400
    default_detail = "Reset token is invalid, expired, or already used."
    default_code = "invalid_or_expired_reset_token"


class InvalidCurrentPasswordError(CustomAPIExeption):
    """Raised by PasswordRecoveryService.change_password when the caller
    submits a wrong `current_password`. Flat 400 (not per-field) to avoid
    leaking whether the password was well-formed but wrong vs. malformed.
    """

    status_code = 400
    default_detail = "Current password is incorrect."
    default_code = "invalid_current_password"


class SuperadminRequiredError(CustomAPIExeption):
    """Raised when a non-superadmin attempts a superadmin-only action
    (admin password reset)."""

    status_code = 403
    default_detail = "Superadmin privileges are required for this action."
    default_code = "superadmin_required"


class UserNotFoundError(CustomAPIExeption):
    """Raised by admin-only flows (admin password reset, CLI reset) when
    the target user does not exist. Never used on anonymous/self-service
    flows — those always succeed silently to avoid enumeration.
    """

    status_code = 404
    default_detail = "User not found."
    default_code = "user_not_found"


class DefaultOrganizationConflictError(CustomAPIExeption):
    """
    Raised when creating the default Organization during first-setup hits a
    uniqueness conflict — e.g. a prior setup left an Organization row behind
    after all users were wiped (User delete cascades OrganizationUser but not
    Organization).
    """

    status_code = 409
    default_detail = (
        "Default organization already exists from a previous setup. "
        "Remove it manually or change DJANGO_DEFAULT_ORG_NAME before retrying."
    )
    default_code = "default_organization_conflict"
