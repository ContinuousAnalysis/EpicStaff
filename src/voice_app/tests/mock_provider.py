import asyncio
import json
import base64
import audioop  # Стандартная библиотека для работы с mu-law
from pathlib import Path
import numpy as np
import soundfile as sf
import websockets
from loguru import logger

# Настройки
INPUT_AUDIO_WAV = Path(__file__).parent / "test_audio.wav"
OUTPUT_AUDIO_WAV = Path(__file__).parent / "ai_response_recorded.wav"
WS_URL = "ws://localhost:8051/voice/stream" # Укажите ваш URL

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
                
                # Конвертируем mu-law (8 бит) -> PCM16 (16 бит)
                # Это нужно, чтобы обычные плееры понимали файл
                # pcm_chunk = audioop.ulaw2lin(mu_law_chunk, 2)
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
    Эмулирует Twilio: читает WAV, ресемплит в 8кГц, 
    конвертирует в mu-law и шлет чанками по 20мс.
    """
    # 1. Читаем файл
    data, samplerate = sf.read(str(file_path), dtype='int16')
    if data.ndim > 1: data = data[:, 0] # mono

    # 2. Ресемплинг в 8000 Гц (обязательно для Twilio mu-law)
    if samplerate != 8000:
        # Простой ресемплинг через audioop
        data_bytes, _ = audioop.ratecv(data.tobytes(), 2, 1, samplerate, 8000, None)
    else:
        data_bytes = data.tobytes()

    # 3. Отправляем событие 'start' (как это делает Twilio)
    await ws.send(json.dumps({
        "event": "start",
        "streamSid": "test_sid_123",
        "start": {"accountSid": "AC_test", "callSid": "CA_test"}
    }))

    # 4. Нарезаем на чанки по 160 байт mu-law (это 20мс аудио при 8кГц)
    # 160 сэмплов PCM16 = 320 байт. После конверсии в mu-law (8 бит) будет 160 байт.
    chunk_samples = 160 
    bytes_per_sample = 2
    step = chunk_samples * bytes_per_sample

    logger.info("Starting audio transmission...")
    for i in range(0, len(data_bytes), step):
        pcm_chunk = data_bytes[i:i + step]
        if not pcm_chunk: break

        # PCM16 -> mu-law
        mulaw_chunk = audioop.lin2ulaw(pcm_chunk, bytes_per_sample)
        payload = base64.b64encode(mulaw_chunk).decode("utf-8")

        media_event = {
            "event": "media",
            "media": {
                "payload": payload
            }
        }
        await ws.send(json.dumps(media_event))
        
        # Twilio шлет аудио в реальном времени (каждые 20мс)
        await asyncio.sleep(0.02)

    # 5. Отправляем 'stop'
    await ws.send(json.dumps({"event": "stop"}))
    logger.info("Sent stop event")

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