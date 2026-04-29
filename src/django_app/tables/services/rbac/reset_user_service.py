from django.contrib.auth import get_user_model
from django.db import transaction

from tables.models.rbac_models import ApiKey
from tables.services.rbac.utils.superadmin_bootstrap import SuperadminBootstrap


class ResetUserService:
    """
    Wipes all Users and ApiKeys, then provisions a fresh superadmin with a
    default-org membership + system API key via SuperadminBootstrap. The
    Organizations table is preserved across the wipe — the bootstrap re-uses
    the existing default org if present, or creates one if not.

    Returns the new user and the raw API key. The view layer wraps both in
    the response payload.
    """

    REALTIME_KEY_NAME = "realtime-default"

    _bootstrap = SuperadminBootstrap()

    @transaction.atomic
    def reset(self, *, email: str, password: str) -> tuple:
        UserModel = get_user_model()
        UserModel.objects.all().delete()
        ApiKey.objects.all().delete()

        result = self._bootstrap.provision(
            email=email,
            password=password,
            api_key_name=self.REALTIME_KEY_NAME,
        )

        return result.user, result.raw_key
