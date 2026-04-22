from tables.exceptions import CustomAPIExeption


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
