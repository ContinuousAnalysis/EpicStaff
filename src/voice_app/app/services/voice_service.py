import redis.asyncio as redis
from loguru import logger
from app.core.config import settings

class VoiceService:
    def __init__(self):
        # Создаем клиент Redis. 
        # В 2026 году для Python 3.12 рекомендуется использовать пул соединений
        self.redis_client = redis.from_url(
            settings.REDIS_URL, 
            encoding="utf-8", 
            decode_responses=False # Важно: мы шлем байты (PCM16), а не текст
        )

    async def handle_audio(self, call_sid: str, pcm16_data: bytes):
        """
        Метод вызывается при получении каждого чанка.
        Публикует аудио-данные в канал Redis.
        """
        if not call_sid:
            return

        # Название канала делаем уникальным для каждого звонка
        channel_name = f"voice:stream:{call_sid}"
        
        try:
            # Публикуем сырые байты PCM16 в канал
            # Любой подписчик (воркер) сможет их прочитать
            subscribers_count = await self.redis_client.publish(channel_name, pcm16_data)
            
            # Опционально: логгируем, если никто не слушает канал
            if subscribers_count == 0:
                # Это нормально, если AI еще не подключился или уже закончил
                pass
                
        except Exception as e:
            logger.error(f"Failed to publish to Redis Pub/Sub: {e}")

    async def mark_call_active(self, call_sid: str):
        """Обновляем статус звонка в обычном Key-Value Redis"""
        await self.redis_client.set(f"call:{call_sid}:active", "1", ex=60)

# Синглтон сервиса
voice_service = VoiceService()