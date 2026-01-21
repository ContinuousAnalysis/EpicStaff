import redis.asyncio as redis
from loguru import logger
from app.core.config import settings

class VoiceService:
    def __init__(self):

        self.redis_client = redis.from_url(
            settings.REDIS_URL, 
            encoding="utf-8", 
            decode_responses=False
        )

    async def handle_audio(self, call_sid: str, pcm16_data: bytes):

        if not call_sid:
            return

        channel_name = f"voice:stream:{call_sid}"
        
        try:

            subscribers_count = await self.redis_client.publish(channel_name, pcm16_data)
            
            if subscribers_count == 0:
                pass
                
        except Exception as e:
            logger.error(f"Failed to publish to Redis Pub/Sub: {e}")

    async def mark_call_active(self, call_sid: str):
        await self.redis_client.set(f"call:{call_sid}:active", "1", ex=60)

voice_service = VoiceService()