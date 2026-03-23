import asyncio
import base64
import json
from typing import Optional

from fastapi import WebSocket
from loguru import logger

from ai.agent.openai_realtime_agent_client import (
    OpenaiRealtimeAgentClient,
    TurnDetectionMode,
)
from models.ai_models import RealtimeTool
from services.tool_manager_service import ToolManagerService
from src.shared.models import RealtimeAgentChatData

# G.711 µ-law: 8000 bytes/sec, Twilio sends 160-byte (20ms) chunks.
# Buffer to 960 bytes (120ms) to reduce per-chunk overhead to OpenAI.
MIN_CHUNK_SIZE = 960


class VoiceStreamHandler:
    """
    Bridges a Twilio MediaStream WebSocket directly to OpenaiRealtimeAgentClient,
    eliminating the intermediate WebSocket hop from voice_app → realtime.

    Audio path: Twilio WS → (in-process) → OpenAI Realtime API
    """

    def __init__(
        self,
        twilio_ws: WebSocket,
        realtime_agent_chat_data: RealtimeAgentChatData,
        instructions: str,
        tool_manager_service: ToolManagerService,
        connections: dict,
    ):
        self.twilio_ws = twilio_ws
        self.realtime_agent_chat_data = realtime_agent_chat_data
        self.instructions = instructions
        self.tool_manager_service = tool_manager_service
        self.connections = connections

        self.stream_sid: Optional[str] = None
        self.audio_accumulator = bytearray()
        self.rt_agent_client: Optional[OpenaiRealtimeAgentClient] = None

    async def execute(self):
        # Register tools the same way ChatExecutor does
        self.tool_manager_service.register_tools_from_rt_agent_chat_data(
            realtime_agent_chat_data=self.realtime_agent_chat_data,
            chat_executor=None,
        )
        rt_tools: list[
            RealtimeTool
        ] = await self.tool_manager_service.get_realtime_tool_models(
            connection_key=self.realtime_agent_chat_data.connection_key
        )

        self.rt_agent_client = OpenaiRealtimeAgentClient(
            api_key=self.realtime_agent_chat_data.rt_api_key,
            connection_key=self.realtime_agent_chat_data.connection_key,
            on_server_event=self._handle_openai_event,
            tool_manager_service=self.tool_manager_service,
            rt_tools=rt_tools,
            model=self.realtime_agent_chat_data.rt_model_name,
            voice=self.realtime_agent_chat_data.voice,
            instructions=self.instructions,
            temperature=self.realtime_agent_chat_data.temperature,
            input_audio_format="g711_ulaw",
            output_audio_format="g711_ulaw",
            turn_detection_mode=TurnDetectionMode.SERVER_VAD,
        )

        await self.rt_agent_client.connect()
        logger.success("Voice stream connected to OpenAI Realtime API")

        message_task = asyncio.create_task(self.rt_agent_client.handle_messages())
        try:
            async for raw in self.twilio_ws.iter_text():
                await self._handle_twilio_message(json.loads(raw))
        except Exception as e:
            logger.error(f"Voice stream error: {e}")
        finally:
            message_task.cancel()
            try:
                await message_task
            except asyncio.CancelledError:
                pass
            await self.rt_agent_client.close()
            logger.info("Voice stream closed")

    async def _handle_twilio_message(self, data: dict):
        event = data.get("event")
        if event == "start":
            self.stream_sid = data["start"]["streamSid"]
            logger.info(f"Twilio stream started: {self.stream_sid}")
        elif event == "media":
            chunk = base64.b64decode(data["media"]["payload"])
            self.audio_accumulator.extend(chunk)
            if len(self.audio_accumulator) >= MIN_CHUNK_SIZE:
                await self._flush_audio()
        elif event == "stop":
            logger.info("Twilio stream stopped")
            if self.audio_accumulator:
                await self._flush_audio()

    async def _flush_audio(self):
        audio_b64 = base64.b64encode(bytes(self.audio_accumulator)).decode()
        await self.rt_agent_client.send_server(
            {
                "type": "input_audio_buffer.append",
                "audio": audio_b64,
            }
        )
        self.audio_accumulator.clear()

    async def _handle_openai_event(self, data: dict):
        """
        Intercepts OpenAI Realtime API events for voice-specific routing.
        Only audio delta and speech interruption events are acted on;
        all other events are dropped (no browser client to forward to).
        """
        event_type = data.get("type")

        if event_type == "response.audio.delta":
            audio_bytes = base64.b64decode(data["delta"])
            await self._send_audio_to_twilio(audio_bytes)

        elif event_type == "input_audio_buffer.speech_started":
            # User started speaking — clear Twilio's playback buffer and cancel response
            await self._clear_twilio_buffer()
            if self.rt_agent_client._is_responding:
                await self.rt_agent_client.send_server({"type": "response.cancel"})

        elif event_type == "error":
            logger.error(f"OpenAI Realtime error in voice stream: {data}")

    async def _send_audio_to_twilio(self, audio_bytes: bytes):
        if self.stream_sid and self.twilio_ws:
            await self.twilio_ws.send_text(
                json.dumps(
                    {
                        "event": "media",
                        "streamSid": self.stream_sid,
                        "media": {"payload": base64.b64encode(audio_bytes).decode()},
                    }
                )
            )

    async def _clear_twilio_buffer(self):
        if self.stream_sid and self.twilio_ws:
            await self.twilio_ws.send_text(
                json.dumps(
                    {
                        "event": "clear",
                        "streamSid": self.stream_sid,
                    }
                )
            )
