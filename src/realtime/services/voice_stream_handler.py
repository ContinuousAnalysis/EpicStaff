import audioop
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
from ai.agent.elevenlabs_realtime_agent_client import ElevenLabsRealtimeAgentClient
from ai.agent.elevenlabs_agent_provisioner import ElevenLabsAgentProvisioner
from models.ai_models import RealtimeTool
from services.tool_manager_service import ToolManagerService
from src.shared.models import RealtimeAgentChatData

# G.711 µ-law: 8000 bytes/sec, Twilio sends 160-byte (20ms) chunks.
# Buffer to 960 bytes (120ms) to reduce per-chunk overhead to OpenAI.
MIN_CHUNK_SIZE = 960


class VoiceStreamHandler:
    """
    Bridges a Twilio MediaStream WebSocket directly to an AI Realtime API client,
    eliminating the intermediate WebSocket hop from voice_app → realtime.

    Supported providers:
      - openai:      Audio path: Twilio (G.711 µ-law) ↔ OpenAI (G.711 µ-law, no conversion)
      - elevenlabs:  Audio path: Twilio (G.711 µ-law) ↔ ElevenLabs (PCM 16kHz, with conversion)
    """

    def __init__(
        self,
        twilio_ws: WebSocket,
        realtime_agent_chat_data: RealtimeAgentChatData,
        instructions: str,
        tool_manager_service: ToolManagerService,
        connections: dict,
        elevenlabs_agent_provisioner: ElevenLabsAgentProvisioner | None = None,
    ):
        self.twilio_ws = twilio_ws
        self.realtime_agent_chat_data = realtime_agent_chat_data
        self.instructions = instructions
        self.tool_manager_service = tool_manager_service
        self.connections = connections
        self.elevenlabs_agent_provisioner = elevenlabs_agent_provisioner

        self.stream_sid: Optional[str] = None
        self.audio_accumulator = bytearray()
        self.rt_agent_client: Optional[
            OpenaiRealtimeAgentClient | ElevenLabsRealtimeAgentClient
        ] = None
        self._is_elevenlabs = realtime_agent_chat_data.rt_provider == "elevenlabs"
        # audioop.ratecv state for resampling continuity (ElevenLabs output: 16kHz → 8kHz)
        self._resample_state = None

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

        if self._is_elevenlabs:
            llm_model = (
                self.realtime_agent_chat_data.llm.config.model
                if self.realtime_agent_chat_data.llm
                else "gpt-4o-mini"
            )
            self.rt_agent_client = ElevenLabsRealtimeAgentClient(
                api_key=self.realtime_agent_chat_data.rt_api_key,
                connection_key=self.realtime_agent_chat_data.connection_key,
                agent_id=self.realtime_agent_chat_data.rt_model_name or "",
                agent_provisioner=self.elevenlabs_agent_provisioner,
                on_server_event=self._handle_provider_event,
                tool_manager_service=self.tool_manager_service,
                rt_tools=rt_tools,
                voice=self.realtime_agent_chat_data.voice,
                instructions=self.instructions,
                temperature=self.realtime_agent_chat_data.temperature,
                llm_model=llm_model,
            )
        else:
            self.rt_agent_client = OpenaiRealtimeAgentClient(
                api_key=self.realtime_agent_chat_data.rt_api_key,
                connection_key=self.realtime_agent_chat_data.connection_key,
                on_server_event=self._handle_provider_event,
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
        provider_name = "ElevenLabs" if self._is_elevenlabs else "OpenAI"
        logger.success(f"Voice stream connected to {provider_name} Realtime API")

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
            if not self._is_elevenlabs:
                # OpenAI needs an explicit response.create to kick off
                await self.rt_agent_client.send_server({"type": "response.create"})
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
        raw = bytes(self.audio_accumulator)
        self.audio_accumulator.clear()

        if self._is_elevenlabs:
            # Twilio sends G.711 µ-law 8kHz → ElevenLabs expects PCM 16-bit 16kHz
            pcm = self._ulaw_to_pcm16k(raw)
            audio_b64 = base64.b64encode(pcm).decode()
            await self.rt_agent_client.send_server(
                {"type": "user_audio_chunk", "user_audio_chunk": {"audio": audio_b64}}
            )
        else:
            audio_b64 = base64.b64encode(raw).decode()
            await self.rt_agent_client.send_server(
                {"type": "input_audio_buffer.append", "audio": audio_b64}
            )

    async def _handle_provider_event(self, data: dict):
        """
        Intercepts provider events for voice-specific routing.
        Only audio delta and speech interruption events are acted on;
        all other events are dropped (no browser client to forward to).
        """
        event_type = data.get("type")

        if event_type == "response.audio.delta":
            audio_bytes = base64.b64decode(data["delta"])
            if self._is_elevenlabs:
                # ElevenLabs sends PCM 16kHz → convert back to G.711 µ-law 8kHz for Twilio
                audio_bytes = self._pcm16k_to_ulaw(audio_bytes)
            await self._send_audio_to_twilio(audio_bytes)

        elif event_type == "input_audio_buffer.speech_started":
            # User started speaking — clear Twilio's playback buffer and cancel response
            await self._clear_twilio_buffer()
            if self.rt_agent_client._is_responding:
                if self._is_elevenlabs:
                    # ElevenLabs interruption handling is server-side; nothing extra needed
                    pass
                else:
                    await self.rt_agent_client.send_server({"type": "response.cancel"})

        elif event_type == "error":
            logger.error(f"Realtime API error in voice stream: {data}")

    # ------------------------------------------------------------------
    # Audio helpers (ElevenLabs only)
    # ------------------------------------------------------------------

    @staticmethod
    def _ulaw_to_pcm16k(ulaw_bytes: bytes) -> bytes:
        """Decode G.711 µ-law 8kHz to 16-bit linear PCM at 16kHz."""
        pcm_8k = audioop.ulaw2lin(ulaw_bytes, 2)  # µ-law → 16-bit PCM @ 8kHz
        pcm_16k, _ = audioop.ratecv(pcm_8k, 2, 1, 8000, 16000, None)
        return pcm_16k

    def _pcm16k_to_ulaw(self, pcm_bytes: bytes) -> bytes:
        """Convert 16-bit linear PCM 16kHz to G.711 µ-law 8kHz."""
        pcm_8k, self._resample_state = audioop.ratecv(
            pcm_bytes, 2, 1, 16000, 8000, self._resample_state
        )
        return audioop.lin2ulaw(pcm_8k, 2)

    # ------------------------------------------------------------------
    # Twilio helpers
    # ------------------------------------------------------------------

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
