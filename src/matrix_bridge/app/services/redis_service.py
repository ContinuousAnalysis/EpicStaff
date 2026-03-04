import asyncio
import json
from typing import Callable, Awaitable

import redis.asyncio as aioredis
from loguru import logger
from app.core.config import get_settings


TERMINAL_STATUSES = {"end", "error", "stop", "expired"}


class RedisService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._client: aioredis.Redis | None = None
        # Futures waiting for a specific session status: session_id -> Future
        self._session_waiters: dict[int, asyncio.Future] = {}

    def _get_client(self) -> aioredis.Redis:
        if self._client is None:
            kwargs: dict = {
                "host": self._settings.redis_host,
                "port": self._settings.redis_port,
                "decode_responses": True,
            }
            if self._settings.redis_password:
                kwargs["password"] = self._settings.redis_password
            self._client = aioredis.Redis(**kwargs)
        return self._client

    async def subscribe_session_status(
        self, session_id: int, timeout: float = 300.0
    ) -> str:
        """
        Await until the given session_id posts a status.
        Returns the status string ("end", "error", etc.) or "timeout".
        """
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        self._session_waiters[session_id] = future
        try:
            return await asyncio.wait_for(asyncio.shield(future), timeout=timeout)
        except asyncio.TimeoutError:
            return "timeout"
        finally:
            self._session_waiters.pop(session_id, None)

    async def run_session_status_listener(self) -> None:
        """
        Long-running background task. Subscribes to sessions:session_status
        and resolves futures for waiting _handle_message() coroutines.
        Message format: {"session_id": 123, "status": "end", "status_data": {...}}
        """
        channel = self._settings.session_status_channel
        client = self._get_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        logger.info(f"Subscribed to Redis channel: {channel}")
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    session_id = data.get("session_id")
                    status = data.get("status")
                    if session_id and status:
                        future = self._session_waiters.get(int(session_id))
                        if future and not future.done() and status in TERMINAL_STATUSES:
                            future.set_result(status)
                except Exception:
                    logger.exception("Error processing session status message")
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)
            raise

    async def subscribe_bots_update(
        self,
        callback: Callable[[str, int], Awaitable[None]],
    ) -> None:
        """
        Long-running background task. Subscribes to matrix:bots:update
        and calls callback(event, bot_id) on each message.
        Message format: {"event": "created"|"updated"|"deleted", "bot_id": 123}
        """
        channel = self._settings.matrix_bots_update_channel
        client = self._get_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        logger.info(f"Subscribed to Redis channel: {channel}")
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    event = data.get("event")
                    bot_id = data.get("bot_id")
                    if event and bot_id:
                        await callback(event, int(bot_id))
                except Exception:
                    logger.exception("Error processing bots update message")
        except asyncio.CancelledError:
            await pubsub.unsubscribe(channel)
            raise
