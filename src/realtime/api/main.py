from typing import Dict
import json
import asyncio
import httpx
from loguru import logger
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
from src.shared.models import RealtimeAgentChatData
from services.chat_executor import ChatExecutor
from services.python_code_executor_service import PythonCodeExecutorService
from services.redis_service import RedisService
from services.tool_manager_service import ToolManagerService
from services.voice_stream_handler import VoiceStreamHandler
from utils.instructions_concatenator import generate_instruction
from ai.agent.openai_realtime_agent_client import OpenaiRealtimeAgentClient
from ai.agent.elevenlabs_agent_provisioner import ElevenLabsAgentProvisioner

from api.connection_repository import ConnectionRepository
from ai.transcription.realtime_transcription import (
    OpenaiRealtimeTranscriptionClient,
)
from core.config import settings


from db.database import get_db, engine
from models.db_models import Base
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


app = FastAPI()
redis_service = RedisService(
    host=settings.REDIS_HOST, port=settings.REDIS_PORT, password=settings.REDIS_PASSWORD
)
python_code_executor_service = PythonCodeExecutorService(redis_service=redis_service)
tool_manager_service = ToolManagerService(
    redis_service=redis_service,
    python_code_executor_service=python_code_executor_service,
    knowledge_search_get_channel=settings.KNOWLEDGE_SEARCH_GET_CHANNEL,
    knowledge_search_response_channel=settings.KNOWLEDGE_SEARCH_RESPONSE_CHANNEL,
    manager_host=settings.MANAGER_HOST,
    manager_port=settings.MANAGER_PORT,
)
elevenlabs_agent_provisioner = ElevenLabsAgentProvisioner(redis_service=redis_service)


# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


connection_repository = ConnectionRepository()

_voice_settings_cache: dict | None = None
_voice_settings_cache_time: float = 0.0
_VOICE_SETTINGS_TTL = 60.0


async def get_voice_settings() -> dict:
    global _voice_settings_cache, _voice_settings_cache_time
    now = asyncio.get_event_loop().time()
    if (
        _voice_settings_cache is None
        or (now - _voice_settings_cache_time) > _VOICE_SETTINGS_TTL
    ):
        try:
            url = settings.INIT_API_URL.replace("init-realtime", "voice-settings")
            async with httpx.AsyncClient() as client:
                r = await client.get(url, timeout=5.0)
                if r.is_success:
                    _voice_settings_cache = r.json()
                    _voice_settings_cache_time = now
        except Exception as e:
            logger.warning(f"Could not fetch voice settings from Django: {e}")
    return _voice_settings_cache or {}


async def redis_listener():
    """Listen to Redis channel and store connection data."""

    redis_service = RedisService(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        password=settings.REDIS_PASSWORD,
    )
    await redis_service.connect()

    pubsub = await redis_service.async_subscribe(
        settings.REALTIME_AGENTS_SCHEMA_CHANNEL
    )
    logger.info(f"Subscribed to channel '{settings.REALTIME_AGENTS_SCHEMA_CHANNEL}'")

    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                realtime_agent_chat_data = RealtimeAgentChatData(**data)
                logger.debug(connection_repository)
                connection_repository.save_connection(
                    realtime_agent_chat_data.connection_key, realtime_agent_chat_data
                )

                logger.info(
                    f"Saved connection: {realtime_agent_chat_data.connection_key}"
                )

            except Exception as e:
                logger.error(f"Error processing embedding: {e}")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.on_event("startup")
async def startup_event():
    """Start Redis listener and init DB on FastAPI startup."""
    await init_db()

    asyncio.create_task(redis_listener())


# Store active connections and their handlers
connections: Dict[
    WebSocket, list[OpenaiRealtimeAgentClient | OpenaiRealtimeTranscriptionClient]
] = {}


@app.websocket("/realtime/")
async def root(
    websocket: WebSocket,
    model: str | None = None,
    connection_key: str | None = None,
    db_session: AsyncSession = Depends(get_db),
):
    if connection_key is None:
        logger.error("Invalid connection_key. Connection refused!")
        await websocket.close(code=1008)
        return
    realtime_agent_chat_data: RealtimeAgentChatData = (
        connection_repository.get_connection(connection_key=connection_key)
    )

    connection_key = realtime_agent_chat_data.connection_key

    instructions = generate_instruction(
        role=realtime_agent_chat_data.role,
        goal=realtime_agent_chat_data.goal,
        backstory=realtime_agent_chat_data.backstory,
    )

    strategy = ChatExecutor(
        client_websocket=websocket,
        realtime_agent_chat_data=realtime_agent_chat_data,
        instructions=instructions,
        redis_service=redis_service,
        python_code_executor_service=python_code_executor_service,
        tool_manager_service=tool_manager_service,
        connections=connections,
        elevenlabs_agent_provisioner=elevenlabs_agent_provisioner,
    )

    await strategy.execute()


@app.websocket("/ht")
async def healthcheck_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except WebSocketDisconnect:
        logger.info("Client disconnected")


@app.post("/voice")
async def twilio_voice_webhook(
    agent_id: int = None,
    language: str = None,
):
    """Twilio calls this on incoming call. Returns TwiML directing audio to /voice/stream.

    Query params (optional):
      agent_id  — which RealtimeAgent to use (default: settings.VOICE_AGENT_ID)
      language  — ISO 639-1 code to override the agent's language (e.g. 'ru', 'en')
    """
    vs = await get_voice_settings()
    effective_agent_id = agent_id or vs.get("voice_agent") or settings.VOICE_AGENT_ID
    voice_stream_url = vs.get("voice_stream_url") or settings.VOICE_STREAM_URL

    params = [f'<Parameter name="agent_id" value="{effective_agent_id}" />']
    if language:
        params.append(f'<Parameter name="language" value="{language}" />')

    params_xml = "\n      ".join(params)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{voice_stream_url}">
      {params_xml}
    </Stream>
  </Connect>
</Response>"""
    return Response(content=twiml, media_type="application/xml")


@app.websocket("/voice/stream")
async def voice_stream(twilio_ws: WebSocket):
    """Twilio MediaStream WebSocket. Bridges audio directly to AI Realtime API."""
    await twilio_ws.accept()
    logger.info("Twilio MediaStream WebSocket accepted")

    # 1. Read the first message to get customParameters from Twilio `start` event
    vs = await get_voice_settings()
    agent_id = vs.get("voice_agent") or settings.VOICE_AGENT_ID
    language_override = None
    try:
        raw = await asyncio.wait_for(twilio_ws.receive_text(), timeout=5.0)
        first_msg = json.loads(raw)
        if first_msg.get("event") == "connected":
            raw = await asyncio.wait_for(twilio_ws.receive_text(), timeout=5.0)
            first_msg = json.loads(raw)
        if first_msg.get("event") == "start":
            custom = first_msg.get("start", {}).get("customParameters", {})
            if "agent_id" in custom:
                agent_id = int(custom["agent_id"])
            if "language" in custom:
                language_override = custom["language"]
            logger.info(
                f"Twilio params: agent_id={agent_id}, language={language_override}"
            )
    except Exception as e:
        logger.warning(f"Could not read Twilio start event: {e}")
        first_msg = None

    # 2. Call Django init-realtime with the resolved agent_id
    async with httpx.AsyncClient() as http_client:
        try:
            resp = await http_client.post(
                settings.INIT_API_URL,
                headers={"Host": "localhost"},
                json={
                    "agent_id": agent_id,
                    "config": {
                        "input_audio_format": "g711_ulaw",
                        "output_audio_format": "g711_ulaw",
                    },
                },
                timeout=10.0,
            )
            if resp.status_code >= 400:
                logger.error(f"Init realtime failed: {resp.status_code} {resp.text}")
                await twilio_ws.close()
                return
            conn_key = resp.json().get("connection_key")
        except Exception as e:
            logger.error(f"Failed to init realtime session: {e}")
            await twilio_ws.close()
            return

    # 2. Wait for Redis listener to store agent config (delivered asynchronously)
    realtime_agent_chat_data = None
    for _ in range(20):  # up to 2 seconds
        realtime_agent_chat_data = connection_repository.get_connection(conn_key)
        if realtime_agent_chat_data:
            break
        await asyncio.sleep(0.1)

    if realtime_agent_chat_data is None:
        logger.error(f"No agent data found for connection_key={conn_key}")
        await twilio_ws.close()
        return

    # 3. Build instructions and hand off to VoiceStreamHandler (no WebSocket hop)
    instructions = generate_instruction(
        role=realtime_agent_chat_data.role,
        goal=realtime_agent_chat_data.goal,
        backstory=realtime_agent_chat_data.backstory,
    )
    handler = VoiceStreamHandler(
        twilio_ws=twilio_ws,
        realtime_agent_chat_data=realtime_agent_chat_data,
        instructions=instructions,
        tool_manager_service=tool_manager_service,
        connections=connections,
        elevenlabs_agent_provisioner=elevenlabs_agent_provisioner,
    )
    await handler.execute()
