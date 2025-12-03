import asyncio
import redis.asyncio as redis
from app.core.config import settings


async def listen_to_voice():
    # Подключаемся к Redis
    r = redis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()

    # Подписываемся на все каналы звонков (используем паттерн psubscribe)
    await pubsub.psubscribe("voice:stream:*")
    print("Listening for voice streams in Redis...")

    try:
        async for message in pubsub.listen():
            if message["type"] == "pmessage":
                channel = message["channel"].decode()
                data_len = len(message["data"])
                print(f"received {data_len} bytes from {channel}")

                # Здесь в реальном приложении данные уходили бы в Whisper или TTS
    except KeyboardInterrupt:
        await pubsub.punsubscribe("voice:stream:*")


if __name__ == "__main__":
    asyncio.run(listen_to_voice())
