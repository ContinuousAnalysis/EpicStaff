import json
import asyncio
import base64
import httpx
import websockets
from fastapi import APIRouter, WebSocket, Response
from loguru import logger

router = APIRouter(prefix="/voice", tags=["voice"])

INIT_API_URL = "http://127.0.0.1:8000/api/init-realtime/"
AI_WS_URL = "ws://127.0.0.1:8050/"
SUBPROTOCOL = "openai-beta.realtime-v1"
AGENT_ID = 2


@router.post("")
async def incoming_call():
    logger.info("Incoming call received")
    return Response(
        content="""
        <Response>
          <Connect>
            <Stream url="wss://punctiliously-interfraternal-millicent.ngrok-free.dev/voice/stream" />
          </Connect>
        </Response>
        """,
        media_type="application/xml",
    )


@router.websocket("/stream")
async def websocket_bridge(twilio_ws: WebSocket):
    await twilio_ws.accept()
    logger.info("WebSocket accepted")

    stream_sid = None
    buffer_in = []
    buffer_out = []

    # 1) Получаем connection_key
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                INIT_API_URL,
                json={
                    "agent_id": AGENT_ID,
                    "config": {
                        "input_audio_format": "g711_ulaw",
                        "output_audio_format": "g711_ulaw",
                    },
                },
            )
            conn_key = resp.json().get("connection_key")
            logger.success(f"Connection key: {conn_key}")
        except Exception as e:
            logger.error(f"Init failed: {e}")
            await twilio_ws.close()
            return

    ai_uri = f"{AI_WS_URL}?connection_key={conn_key}"

    try:
        async with websockets.connect(ai_uri, subprotocols=[SUBPROTOCOL]) as ai_ws:
            logger.success("Connected to AI Service")

            # 2) Setup AI session
            session_update = {
                "type": "session.update",
                "session": {
                    "instructions": "Ты полезный ассистент.",
                    "voice": "alloy",
                    "input_audio_format": "g711_ulaw",
                    "output_audio_format": "g711_ulaw",
                    "modalities": ["audio", "text"],
                    "turn_detection": {"type": "server_vad"},
                },
            }
            await ai_ws.send(json.dumps(session_update))

            async def phone_to_ai():
                """Twilio -> AI с правильной буферизацией байтов"""
                nonlocal stream_sid
                audio_buffer = []
                # 10 чанков по 20мс = 200мс. Можно уменьшить до 5 (100мс) для скорости.
                chunk_size_threshold = 10 

                async for message in twilio_ws.iter_text():
                    data = json.loads(message)

                    if data.get("event") == "start":
                        stream_sid = data["start"]["streamSid"]
                        logger.success(f"Stream SID: {stream_sid}")
                        continue

                    if data.get("event") == "media":
                        # 1. Сразу декодируем Base64 в байты
                        chunk_payload = base64.b64decode(data["media"]["payload"])
                        audio_buffer.append(chunk_payload)

                        # 2. Проверяем порог накопления
                        if len(audio_buffer) >= chunk_size_threshold:
                            # 3. Склеиваем байты (теперь тут только байты, ошибки не будет)
                            raw_audio = b"".join(audio_buffer)
                            
                            # 4. Кодируем обратно в base64 для OpenAI
                            encoded_audio = base64.b64encode(raw_audio).decode("utf-8")
                            
                            audio_event = {
                                "type": "input_audio_buffer.append",
                                "audio": encoded_audio,
                            }
                            
                            await ai_ws.send(json.dumps(audio_event))
                            
                            # Опционально сохраняем для отладки
                            buffer_in.append({"type": "input_audio_buffer.append", "audio": "..."})
                            
                            # 5. Очищаем буфер
                            audio_buffer = []

                    elif data.get("event") == "stop":
                        logger.warning("Twilio stream stopped")
                        break

            async def ai_to_phone():
                """AI -> Twilio stream logic with interruption handling"""
                nonlocal stream_sid
                last_assistant_item_id = None
                total_bytes_sent = 0

                while True:
                    try:
                        ai_message = await ai_ws.recv()
                        data = json.loads(ai_message)

                        # 1. Capture the item_id when the model starts a response
                        if data.get("type") == "response.audio.start":
                            last_assistant_item_id = data.get("item_id")
                            total_bytes_sent = 0
                            logger.info(f"AI started response: {last_assistant_item_id}")

                        # 2. Forward audio to Twilio and track playback offset
                        elif data.get("type") == "response.audio.delta":
                            if stream_sid and data.get("delta"):
                                # Calculate duration: G.711 u-law is 8000 bytes per second.
                                # 1 byte = 1 sample = 0.125ms.
                                audio_bytes = base64.b64decode(data["delta"])
                                total_bytes_sent += len(audio_bytes)

                                payload = {
                                    "event": "media",
                                    "streamSid": stream_sid,
                                    "media": {"payload": data["delta"]},
                                }
                                await twilio_ws.send_text(json.dumps(payload))

                        # 3. Handle Interruption (User starts speaking)
                        elif data.get("type") == "input_audio_buffer.speech_started":
                            logger.warning("User interrupted. Clearing buffers.")
                            
                            # A) Tell Twilio to stop playing buffered audio immediately
                            if stream_sid:
                                await twilio_ws.send_text(json.dumps({
                                    "event": "clear",
                                    "streamSid": stream_sid
                                }))

                            # B) Tell AI to truncate its memory of the last response
                            if last_assistant_item_id:
                                # Convert bytes to milliseconds for the AI
                                # (total_bytes / 8000 samples/sec) * 1000 ms/sec = total_bytes / 8
                                playback_offset_ms = 1500 # int(total_bytes_sent / 8)
                                
                                truncate_event = {
                                    "type": "conversation.item.truncate",
                                    "item_id": last_assistant_item_id,
                                    "content_index": 0,
                                    "audio_end_ms": playback_offset_ms
                                }
                                await ai_ws.send(json.dumps(truncate_event))
                                logger.info(f"Truncated {last_assistant_item_id} at {playback_offset_ms}ms")

                        # 4. Handle cancellation cleanup
                        elif data.get("type") == "response.cancelled":
                            logger.info("AI response successfully cancelled.")

                    except Exception as e:
                        logger.error(f"Error in ai_to_phone: {e}")
                        break

            await asyncio.gather(phone_to_ai(), ai_to_phone())

    except Exception as e:
        logger.error(f"Bridge error: {e}")

    finally:

        await twilio_ws.close()
