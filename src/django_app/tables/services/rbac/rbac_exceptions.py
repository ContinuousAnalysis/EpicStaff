from tables.exceptions import CustomAPIExeption


class SetupAlreadyCompletedError(CustomAPIExeption):
    """Raised by FirstSetupService when setup has already been performed."""

    status_code = 409
    default_detail = "Setup has already been completed"
    default_code = "setup_already_completed"


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
