import secrets
from typing import Optional, Tuple

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache


class SseTicketService:
    """
    Single-use, short-lived tickets that authenticate SSE (EventSource)
    connections. EventSource cannot attach an `Authorization` header, so the
    client POSTs with JWT to issue a ticket and then opens the SSE URL with
    `?ticket=<value>`. The ticket is consumed on first read, so reconnects
    require a fresh ticket.

    State lives in the Redis cache backend (configured in settings.CACHES),
    so this is horizontally scalable with no app-server stickiness required.
    """

    CACHE_PREFIX = "rbac:sse_ticket:"

    @property
    def ttl_seconds(self) -> int:
        return settings.SSE_TICKET_TTL_SECONDS

    def _cache_key(self, ticket: str) -> str:
        return f"{self.CACHE_PREFIX}{ticket}"

    def issue(self, user) -> Tuple[str, int]:
        ticket = secrets.token_urlsafe(32)
        cache.set(self._cache_key(ticket), user.pk, timeout=self.ttl_seconds)
        return ticket, self.ttl_seconds

    def consume(self, ticket: str) -> Optional[object]:
        if not ticket:
            return None
        key = self._cache_key(ticket)
        user_id = cache.get(key)
        if user_id is None:
            return None
        cache.delete(key)
        return get_user_model().objects.filter(pk=user_id).first()
