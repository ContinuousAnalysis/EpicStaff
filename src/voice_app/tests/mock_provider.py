import asyncio
import json
import base64
from pathlib import Path
import numpy as np
import soundfile as sf
import websockets
from loguru import logger

# Настройки
INPUT_AUDIO_WAV = Path(__file__).parent / "../buffer_in_data19-01-19-09-03.wav"
OUTPUT_AUDIO_WAV = Path(__file__).parent / "ai_response_recorded.wav"
WS_URL = "wss://punctiliously-interfraternal-millicent.ngrok-free.dev/voice/stream"  # Укажите ваш URL


async def receive_and_save_audio(ws):
    """
    Принимает ответы от моста.
    Мост пересылает нам события от OpenAI в формате Twilio (media.payload).
    """
    audio_buffer = bytearray()
    logger.info("Начинаю запись входящего потока...")

    try:
        async for message in ws:
            data = json.loads(message)

            # Ловим аудио-события (формат Twilio)
            if data.get("event") == "media":
                payload = data["media"]["payload"]
                mu_law_chunk = base64.b64decode(payload)

                audio_buffer.extend(mu_law_chunk)

            elif data.get("event") == "stop":
                logger.info("Получено событие stop от моста")
                break

    except Exception as e:
        logger.error(f"Ошибка при получении аудио: {e}")
    finally:
        if len(audio_buffer) > 0:
            # Превращаем байты в массив чисел для soundfile
            audio_array = np.frombuffer(audio_buffer, dtype=np.int16)

            # Сохраняем как WAV 8000 Гц
            sf.write(str(OUTPUT_AUDIO_WAV), audio_array, 8000)
            logger.success(f"Звук сохранен! Файл: {OUTPUT_AUDIO_WAV}")
            logger.info(f"Длительность: {len(audio_array)/8000:.2f} сек.")
        else:
            logger.warning("Буфер пуст, файл не сохранен.")


async def send_twilio_simulated_audio(ws, file_path: Path):
    """
    Файл: raw μ-law, 8kHz, mono
    """
    # 1. Читаем raw μ-law
    with open(file_path, "rb") as f:
        mulaw_data = f.read()

    # 2. start
    await ws.send(
        json.dumps(
            {
                "event": "start",
                "streamSid": "test_sid_123",
                "start": {"accountSid": "AC_test", "callSid": "CA_test"},
            }
        )
    )

    # 3. Шлем по 20мс (160 байт)
    chunk_size = 160

    logger.info("Starting audio transmission...")

    for i in range(0, len(mulaw_data), chunk_size):
        chunk = mulaw_data[i : i + chunk_size]
        if not chunk:
            break

        payload = base64.b64encode(chunk).decode()

        await ws.send(json.dumps({"event": "media", "media": {"payload": payload}}))

        await asyncio.sleep(0.02)

    await ws.send(json.dumps({"event": "stop"}))


async def main():
    if not INPUT_AUDIO_WAV.exists():
        logger.error(f"File {INPUT_AUDIO_WAV} not found!")
        return

    async with websockets.connect(WS_URL) as ws:
        logger.info(f"Connected to {WS_URL}")

        # Запускаем чтение и запись параллельно
        receiver = asyncio.create_task(receive_and_save_audio(ws))
        sender = asyncio.create_task(send_twilio_simulated_audio(ws, INPUT_AUDIO_WAV))

        await sender
        # Даем время AI договорить после того как мы закончили слать файл
        await asyncio.sleep(5)
        await ws.close()
        receiver.cancel()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
