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
from services.tool_manager_service import ToolManagerService
from src.shared.models import RealtimeAgentChatData

# Увеличиваем буфер, чтобы ElevenLabs стабильнее распознавал речь (минимум 250-500мс)
MIN_CHUNK_SIZE = 2000


class VoiceStreamHandler:
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

        # Состояния для плавного ресамплинга (убирают щелчки)
        self._up_resample_state = None  # Twilio -> AI
        self._down_resample_state = None  # AI -> Twilio

    async def execute(self):
        self.tool_manager_service.register_tools_from_rt_agent_chat_data(
            realtime_agent_chat_data=self.realtime_agent_chat_data,
            chat_executor=None,
        )
        rt_tools = await self.tool_manager_service.get_realtime_tool_models(
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
            # Важно для логики внутри клиента (если она там есть)
            self.rt_agent_client.is_twilio = True
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
        logger.success(f"Voice stream connected to {provider_name}")

        message_task = asyncio.create_task(self.rt_agent_client.handle_messages())
        try:
            async for raw in self.twilio_ws.iter_text():
                await self._handle_twilio_message(json.loads(raw))
        except Exception as e:
            logger.error(f"Twilio WebSocket Error: {e}")
        finally:
            message_task.cancel()
            await self.rt_agent_client.close()

    async def _handle_twilio_message(self, data: dict):
        event = data.get("event")
        if event == "start":
            self.stream_sid = data["start"]["streamSid"]
            # Передаем sid в клиент, чтобы он знал куда слать ивенты если нужно
            self.rt_agent_client.stream_sid = self.stream_sid
            logger.info(f"Twilio stream started: {self.stream_sid}")

            if not self._is_elevenlabs:
                await self.rt_agent_client.send_server({"type": "response.create"})

        elif event == "media":
            payload = data["media"]["payload"]
            chunk = base64.b64decode(payload)
            self.audio_accumulator.extend(chunk)

            if len(self.audio_accumulator) >= MIN_CHUNK_SIZE:
                await self._flush_audio()

        elif event == "stop":
            logger.info("Twilio stream stopped")

    async def _flush_audio(self):
        if not self.audio_accumulator:
            return

        raw = bytes(self.audio_accumulator)
        self.audio_accumulator.clear()

        if self._is_elevenlabs:
            # Twilio (µ-law 8kHz) -> ElevenLabs (PCM 16kHz)
            pcm16 = self._ulaw_to_pcm16k(raw)
            audio_b64 = base64.b64encode(pcm16).decode()
            # ФИКС: Правильная структура ивента для ElevenLabs
            await self.rt_agent_client.send_server(
                {"type": "user_audio_chunk", "chunk": audio_b64}
            )
        else:
            audio_b64 = base64.b64encode(raw).decode()
            await self.rt_agent_client.send_server(
                {"type": "input_audio_buffer.append", "audio": audio_b64}
            )

    async def _handle_provider_event(self, data: dict):
        """Маршрутизация событий от ИИ провайдера обратно в Twilio."""
        event_type = data.get("type")

        # 1. Обработка аудио
        if event_type == "response.audio.delta":
            try:
                audio_bytes = base64.b64decode(data["delta"])
                if self._is_elevenlabs:
                    # ElevenLabs (PCM 16kHz или 24kHz) -> Twilio (µ-law 8kHz)
                    # Если вы используете модель Flash, там 16кГц. Если Turbo - 24кГц.
                    audio_bytes = self._pcm_to_ulaw(audio_bytes, input_rate=16000)

                await self._send_audio_to_twilio(audio_bytes)
            except Exception as e:
                logger.error(f"Error processing audio delta: {e}")

        # 2. Обработка прерывания (Interruption)
        elif event_type in ["input_audio_buffer.speech_started", "interruption"]:
            await self._clear_twilio_buffer()

            # Если это OpenAI - отменяем текущую генерацию
            if not self._is_elevenlabs:
                is_responding = getattr(self.rt_agent_client, "_is_responding", False)
                if is_responding:
                    await self.rt_agent_client.send_server({"type": "response.cancel"})

        elif event_type == "error":
            logger.error(f"Provider Error: {data}")

    # ------------------------------------------------------------------
    # Audio Helpers
    # ------------------------------------------------------------------

    def _ulaw_to_pcm16k(self, ulaw_bytes: bytes) -> bytes:
        """Конвертация µ-law 8kHz в PCM 16kHz с сохранением состояния."""
        pcm_8k = audioop.ulaw2lin(ulaw_bytes, 2)
        # Добавляем состояние ресамплинга для чистого звука
        pcm_16k, self._up_resample_state = audioop.ratecv(
            pcm_8k, 2, 1, 8000, 16000, self._up_resample_state
        )
        return pcm_16k

    def _pcm_to_ulaw(self, pcm_bytes: bytes, input_rate: int = 16000) -> bytes:
        """Конвертация PCM в µ-law 8kHz для Twilio."""
        # Ресамплинг до 8000Гц
        pcm_8k, self._down_resample_state = audioop.ratecv(
            pcm_bytes, 2, 1, input_rate, 8000, self._down_resample_state
        )
        return audioop.lin2ulaw(pcm_8k, 2)

    async def _send_audio_to_twilio(self, audio_bytes: bytes):
        if self.stream_sid and self.twilio_ws:
            try:
                await self.twilio_ws.send_json(
                    {
                        "event": "media",
                        "streamSid": self.stream_sid,
                        "media": {"payload": base64.b64encode(audio_bytes).decode()},
                    }
                )
            except Exception as e:
                logger.error(f"Twilio send error: {e}")

    async def _clear_twilio_buffer(self):
        """Очистка буфера воспроизведения Twilio (при перебивании)."""
        if self.stream_sid and self.twilio_ws:
            await self.twilio_ws.send_json(
                {
                    "event": "clear",
                    "streamSid": self.stream_sid,
                }
            )
