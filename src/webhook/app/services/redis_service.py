import redis.asyncio as aioredis
import json
from app.core.config import settings
from typing import Dict, Any, Optional

class RedisService:
    """
    Handles all communication with the Redis server.
    """
    def __init__(self, host: str, port: int):
        self.redis_url = f"redis://{host}:{port}"
        self.client = aioredis.from_url(self.redis_url, decode_responses=True)
        print(f"RedisService initialized for {self.redis_url}")

    async def publish_webhook(self, custom_id: str, payload: Dict[str, Any]):
        """
        Modifies the data and publishes it to a Redis channel.
        """
        channel = "webhooks"
        
        # This is the "modified data" you mentioned
        message_data = {
            "source": "webhook_service",
            "id": custom_id,
            "payload": payload
        }
        
        message_json = json.dumps(message_data)
        
        print(f"Publishing to Redis channel '{channel}'")
        await self.client.publish(channel, message_json)

    async def close(self):
        """Closes the Redis connection."""
        print("Closing Redis connection...")
        await self.client.close()


# --- Dependency Injection Setup ---
# This pattern creates a single, reusable Redis client
# that FastAPI can "inject" into your routes.

_redis_client: Optional[RedisService] = None

async def get_redis_service() -> RedisService:
    """FastAPI dependency to get the singleton RedisService."""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisService(host=settings.REDIS_HOST, port=settings.REDIS_PORT)
    return _redis_client

async def close_redis_connection():
    """Event handler to cleanly close the connection on shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None