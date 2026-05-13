from typing import Optional
from uuid import UUID

from tables.models.rbac_models import PasswordResetToken


class PasswordResetTokenRepository:
    """Thin data-access gateway around `PasswordResetToken`.

    Keeps the orchestrator free of ORM specifics. The "active" predicate
    (not used AND not expired) lives here and only here — any caller
    looking up a token by UUID receives either an active token or None,
    never an inactive row it has to re-check.
    """

    def invalidate_all_for_user(self, user) -> int:
        return PasswordResetToken.objects.filter(user=user, is_used=False).update(
            is_used=True
        )

    def create_for_user(self, user) -> PasswordResetToken:
        return PasswordResetToken.objects.create(user=user)

    def get_active_by_uuid(self, token: UUID) -> Optional[PasswordResetToken]:
        row = (
            PasswordResetToken.objects.select_related("user")
            .filter(token=token, is_used=False)
            .first()
        )
        if row is None or row.is_expired():
            return None
        return row

    def mark_used(self, token: PasswordResetToken) -> None:
        token.is_used = True
        token.save(update_fields=["is_used"])
