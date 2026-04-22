"""
Integration tests for the Story 2 auth surface:

- First-setup idempotency
- Login valid/invalid + consistent 401 envelope
- /me via JWT / env ApiKey / user ApiKey
- Refresh rotation + blacklist
- Logout
- Login throttle (composite IP|email, 5/min)
- SSE ticket issue/consume single-use + expired
"""

from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from tables.services.rbac.sse_ticket_service import SseTicketService


# ---------------- First-setup ----------------


@pytest.mark.django_db
def test_first_setup_flow_is_idempotent(api_client):
    url = reverse("first_setup")

    r = api_client.get(url)
    assert r.status_code == 200
    assert r.json() == {"needs_setup": True}

    r = api_client.post(
        url,
        data={"email": "boss@example.com", "password": "StrongPass123!"},
        format="json",
    )
    assert r.status_code == status.HTTP_201_CREATED
    payload = r.json()
    assert payload["user"]["email"] == "boss@example.com"
    assert payload["user"]["is_superadmin"] is True
    assert "access" in payload and "refresh" in payload

    r = api_client.get(url)
    assert r.json() == {"needs_setup": False}

    r = api_client.post(
        url,
        data={"email": "other@example.com", "password": "AnotherPass456!"},
        format="json",
    )
    assert r.status_code == status.HTTP_409_CONFLICT


# ---------------- Login / auth envelope ----------------


@pytest.mark.django_db
def test_login_valid_credentials_returns_tokens(api_client, regular_user):
    r = api_client.post(
        reverse("login"),
        data={"email": regular_user.email, "password": "UserStrongPass123!"},
        format="json",
    )
    assert r.status_code == 200
    body = r.json()
    assert "access" in body and "refresh" in body


@pytest.mark.django_db
def test_login_invalid_credentials_returns_401(api_client, regular_user):
    r = api_client.post(
        reverse("login"),
        data={"email": regular_user.email, "password": "wrong"},
        format="json",
    )
    assert r.status_code == 401


@pytest.mark.django_db
def test_protected_route_without_token_returns_401_project_envelope(api_client):
    r = api_client.get(reverse("auth_me"))
    assert r.status_code == 401
    body = r.json()
    assert body["status_code"] == 401
    assert "code" in body
    assert "message" in body


# ---------------- /me ----------------


@pytest.mark.django_db
def test_me_via_jwt_returns_user_and_memberships(auth_client, regular_user):
    r = auth_client.get(reverse("auth_me"))
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == regular_user.email
    assert isinstance(body["memberships"], list)
    assert len(body["memberships"]) == 1
    assert body["memberships"][0]["role"]["name"] == "Org Admin"


@pytest.mark.django_db
def test_me_via_env_api_key_returns_403(api_client, env_api_key):
    raw, _ = env_api_key
    api_client.credentials(HTTP_X_API_KEY=raw)
    r = api_client.get(reverse("auth_me"))
    assert r.status_code == 403


@pytest.mark.django_db
def test_me_via_user_api_key_returns_user(api_client, user_api_key, regular_user):
    raw, _ = user_api_key
    api_client.credentials(HTTP_X_API_KEY=raw)
    r = api_client.get(reverse("auth_me"))
    assert r.status_code == 200
    assert r.json()["email"] == regular_user.email


# ---------------- Refresh rotation / logout / blacklist ----------------


@pytest.mark.django_db
def test_refresh_rotation_invalidates_old_refresh(api_client, regular_user):
    r = api_client.post(
        reverse("login"),
        data={"email": regular_user.email, "password": "UserStrongPass123!"},
        format="json",
    )
    old_refresh = r.json()["refresh"]

    r1 = api_client.post(
        reverse("refresh"), data={"refresh": old_refresh}, format="json"
    )
    assert r1.status_code == 200
    new_refresh = r1.json()["refresh"]
    assert new_refresh != old_refresh

    r2 = api_client.post(
        reverse("refresh"), data={"refresh": old_refresh}, format="json"
    )
    assert r2.status_code == 401


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(api_client, regular_user, jwt_tokens):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_tokens['access']}")

    r = api_client.post(
        reverse("logout"),
        data={"refresh": jwt_tokens["refresh"]},
        format="json",
    )
    assert r.status_code == status.HTTP_205_RESET_CONTENT

    api_client.credentials()
    r2 = api_client.post(
        reverse("refresh"), data={"refresh": jwt_tokens["refresh"]}, format="json"
    )
    assert r2.status_code == 401


@pytest.mark.django_db
def test_logout_rejects_malformed_refresh(api_client, jwt_tokens):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_tokens['access']}")
    r = api_client.post(
        reverse("logout"), data={"refresh": "not-a-real-token"}, format="json"
    )
    assert r.status_code == 400
    assert r.json()["code"] == "invalid_or_expired_refresh"


# ---------------- Throttling ----------------


@pytest.mark.django_db
def test_login_throttle_blocks_6th_attempt_with_retry_after(api_client, regular_user):
    cache.clear()
    url = reverse("login")
    for _ in range(5):
        api_client.post(
            url,
            data={"email": regular_user.email, "password": "wrong"},
            format="json",
        )
    r = api_client.post(
        url,
        data={"email": regular_user.email, "password": "wrong"},
        format="json",
    )
    assert r.status_code == 429
    assert "Retry-After" in r.headers or "retry-after" in {k.lower() for k in r.headers}


@pytest.mark.django_db
def test_login_throttle_is_per_email(api_client, regular_user):
    cache.clear()
    url = reverse("login")
    for _ in range(5):
        api_client.post(
            url,
            data={"email": regular_user.email, "password": "wrong"},
            format="json",
        )
    r = api_client.post(
        url,
        data={"email": "other@example.com", "password": "wrong"},
        format="json",
    )
    # Different email -> different bucket -> not throttled (would be 401 instead)
    assert r.status_code != 429


# ---------------- SSE ticket ----------------


@pytest.mark.django_db
def test_sse_ticket_is_single_use(auth_client, regular_user):
    cache.clear()
    r = auth_client.post(reverse("sse_ticket"))
    assert r.status_code == 200
    ticket = r.json()["ticket"]
    assert r.json()["expires_in"] == 300

    service = SseTicketService()
    user = service.consume(ticket)
    assert user is not None
    assert user.pk == regular_user.pk

    # Second consume fails
    assert service.consume(ticket) is None


@pytest.mark.django_db
def test_sse_ticket_expired_or_unknown_returns_none():
    cache.clear()
    service = SseTicketService()
    assert service.consume("no-such-ticket") is None
    assert service.consume("") is None


@pytest.mark.django_db
def test_sse_ticket_endpoint_requires_jwt(api_client):
    r = api_client.post(reverse("sse_ticket"))
    assert r.status_code == 401
