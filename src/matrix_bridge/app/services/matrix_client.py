import httpx
from loguru import logger
from app.core.config import get_settings


class MatrixClient:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._homeserver_url = self._settings.matrix_homeserver_url
        self._as_token = self._settings.matrix_as_token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._as_token}"}

    async def ensure_user_exists(self, user_id: str) -> None:
        """Register the virtual user on Synapse if not already registered."""
        localpart = user_id.split(":")[0].lstrip("@")
        url = f"{self._homeserver_url}/_matrix/client/v3/register"
        payload = {"type": "m.login.application_service", "username": localpart}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=self._headers())
            if response.status_code in (200, 400):
                # 200 = registered, 400 M_USER_IN_USE = already exists
                data = response.json()
                if response.status_code == 400:
                    error_code = data.get("errcode", "")
                    if error_code == "M_USER_IN_USE":
                        logger.debug(f"User {user_id} already exists")
                        return
                    logger.warning(f"Unexpected 400 registering {user_id}: {data}")
                else:
                    logger.info(f"Registered virtual user {user_id}")
            else:
                logger.error(
                    f"Failed to register {user_id}: {response.status_code} {response.text}"
                )

    async def get_joined_rooms(self, user_id: str) -> list[str]:
        """Get rooms that the virtual user has joined."""
        url = f"{self._homeserver_url}/_matrix/client/v3/joined_rooms"
        params = {"user_id": user_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    url, params=params, headers=self._headers()
                )
                response.raise_for_status()
                return response.json().get("joined_rooms", [])
            except httpx.HTTPError:
                logger.exception(f"Failed to get joined rooms for {user_id}")
                return []

    async def get_pending_invites(self, user_id: str) -> list[str]:
        """Get room IDs where the virtual user has a pending invite."""
        import json as _json
        url = f"{self._homeserver_url}/_matrix/client/v3/sync"
        params = {
            "user_id": user_id,
            "timeout": "0",
            "filter": _json.dumps({"room": {"timeline": {"limit": 0}}}),
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, params=params, headers=self._headers())
                response.raise_for_status()
                data = response.json()
                return list(data.get("rooms", {}).get("invite", {}).keys())
            except httpx.HTTPError:
                logger.exception(f"Failed to get pending invites for {user_id}")
                return []

    async def get_direct_rooms(self, user_id: str) -> set[str]:
        """Read m.direct account data to recover DM room IDs across restarts."""
        url = f"{self._homeserver_url}/_matrix/client/v3/user/{user_id}/account_data/m.direct"
        params = {"user_id": user_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url, params=params, headers=self._headers())
                if response.status_code == 404:
                    return set()
                response.raise_for_status()
                data = response.json()
                return {room_id for rooms in data.values() for room_id in rooms}
            except httpx.HTTPError:
                logger.exception(f"Failed to get m.direct for {user_id}")
                return set()

    async def mark_room_as_direct(self, user_id: str, inviter_id: str, room_id: str) -> None:
        """Persist a DM room in m.direct account data."""
        current = {}
        url = f"{self._homeserver_url}/_matrix/client/v3/user/{user_id}/account_data/m.direct"
        params = {"user_id": user_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url, params=params, headers=self._headers())
                if resp.status_code == 200:
                    current = resp.json()
            except httpx.HTTPError:
                pass
            current.setdefault(inviter_id, [])
            if room_id not in current[inviter_id]:
                current[inviter_id].append(room_id)
            try:
                await client.put(url, json=current, params=params, headers=self._headers())
                logger.debug(f"Marked {room_id} as DM for {user_id}")
            except httpx.HTTPError:
                logger.exception(f"Failed to set m.direct for {user_id}")

    async def join_room(self, user_id: str, room_id: str) -> None:
        """Make the virtual user join a room."""
        url = f"{self._homeserver_url}/_matrix/client/v3/join/{room_id}"
        params = {"user_id": user_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url, json={}, params=params, headers=self._headers()
                )
                response.raise_for_status()
                logger.info(f"User {user_id} joined room {room_id}")
            except httpx.HTTPError:
                logger.exception(f"Failed to join room {room_id} as {user_id}")

    async def send_message(self, user_id: str, room_id: str, message: str) -> None:
        """Send a text message to a room as the virtual user."""
        import time

        txn_id = f"bridge_{int(time.time() * 1000)}"
        url = (
            f"{self._homeserver_url}/_matrix/client/v3/rooms/{room_id}"
            f"/send/m.room.message/{txn_id}"
        )
        params = {"user_id": user_id}
        payload = {"msgtype": "m.text", "body": message}
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.put(
                    url, json=payload, params=params, headers=self._headers()
                )
                response.raise_for_status()
                logger.info(f"Sent message in {room_id} as {user_id}")
            except httpx.HTTPError:
                logger.exception(f"Failed to send message in {room_id}")
