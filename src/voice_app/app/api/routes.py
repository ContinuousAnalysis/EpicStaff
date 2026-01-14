import json
import asyncio
import base64
import httpx
import websockets
import audioop  # Библиотека для работы с аудио-форматами
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
          <Say>Connecting you to the assistant</Say>
          <Connect>
            <Stream url="https://punctiliously-interfraternal-millicent.ngrok-free.dev" />
          </Connect>
        </Response>
        """,
        media_type="application/xml",
    )


@router.websocket("/stream")
async def websocket_bridge(twilio_ws: WebSocket):
    await twilio_ws.accept()
    logger.info("WebSocket accepted")

    # 1. Получаем connection_key
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

            # --- Настройка сессии: ТЕПЕРЬ PCM16 ---
            session_update = {
                "type": "session.update",
                "session": {
                    "instructions": "Ты полезный ассистент.",
                    "voice": "alloy",
                    "input_audio_format": "pcm16",  # AI ждет PCM
                    "output_audio_format": "pcm16",  # AI отдает PCM
                    "modalities": ["audio", "text"],
                    "turn_detection": {"type": "server_vad"},
                },
            }
            await ai_ws.send(json.dumps(session_update))

            async def phone_to_ai():
                """Twilio (mu-law) -> PCM16 -> AI"""
                async for message in twilio_ws.iter_text():
                    try:
                        data = json.loads(message)
                        if data.get("event") == "media":
                            # 1. Получаем mu-law из Twilio
                            mu_law_payload = data["media"]["payload"]

                            # 2. Отправляем mu-law в AI сервис
                            audio_event = {
                                "type": "input_audio_buffer.append",
                                "audio": mu_law_payload,
                            }
                            await ai_ws.send(json.dumps(audio_event))
                    except Exception as e:
                        logger.error(f"phone_to_ai error: {e}")

            async def ai_to_phone():
                """AI (PCM16) -> mu-law -> Twilio"""
                async for ai_message in ai_ws:
                    try:
                        data = json.loads(ai_message)
                        if data.get("type") == "response.audio.delta":

                            # 1. Отправляем в Twilio
                            await twilio_ws.send_text(
                                json.dumps(
                                    {
                                        "event": "media",
                                        "media": {"payload": data["delta"]},
                                    }
                                )
                            )

                        elif data.get("type") == "error":
                            logger.error(f"AI Error: {data}")

                    except Exception as e:
                        logger.error(f"ai_to_phone error: {e}")

            await asyncio.gather(phone_to_ai(), ai_to_phone())

    except Exception as e:
        logger.error(f"Bridge error: {e}")
    finally:
        await twilio_ws.close()
