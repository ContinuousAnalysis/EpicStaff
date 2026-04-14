import asyncio
import base64
import json
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

try:
    from websockets.exceptions import ConnectionClosedOK as _WsClosedOK
except ImportError:
    _WsClosedOK = None

from src.shared.models import RealtimeAgentChatData

from domain.ports.i_realtime_agent_client import IRealtimeAgentClient
from infrastructure.providers.factory import RealtimeAgentClientFactory
from application.tool_manager_service import ToolManagerService

MIN_CHUNK_SIZE = 2000


class VoiceCallService:
    """
    Use case: bridges a Twilio MediaStream WebSocket to a realtime AI provider.
    Zero provider-specific code — all audio format differences are handled inside
    the provider adapters (send_audio for input, server event handler for output).
    """

    def __init__(
        self,
        twilio_ws: WebSocket,
        realtime_agent_chat_data: RealtimeAgentChatData,
        instructions: str,
        tool_manager_service: ToolManagerService,
        connections: dict,
        factory: RealtimeAgentClientFactory,
        initial_message: Optional[dict] = None,
    ):
        self.twilio_ws = twilio_ws
        self.realtime_agent_chat_data = realtime_agent_chat_data
        self.instructions = instructions
        self.tool_manager_service = tool_manager_service
        self.connections = connections
        self.factory = factory
        self.initial_message = initial_message

        self.stream_sid: Optional[str] = None
        self.audio_accumulator = bytearray()

    async def execute(self):
        self.tool_manager_service.register_tools_from_rt_agent_chat_data(
            realtime_agent_chat_data=self.realtime_agent_chat_data,
            chat_mode_controller=None,
        )
        rt_tools = await self.tool_manager_service.get_realtime_tool_models(
            connection_key=self.realtime_agent_chat_data.connection_key
        )

        rt_agent_client: IRealtimeAgentClient = self.factory.create(
            config=self.realtime_agent_chat_data,
            rt_tools=rt_tools,
            instructions=self.instructions,
            tool_manager_service=self.tool_manager_service,
            on_server_event=self._handle_provider_event,
            is_twilio=True,
        )

        await rt_agent_client.connect()
        logger.success(
            f"Voice stream connected to provider: {self.realtime_agent_chat_data.rt_provider}"
        )

        message_task = asyncio.create_task(rt_agent_client.handle_messages())
        try:
            if self.initial_message:
                await self._handle_twilio_message(self.initial_message, rt_agent_client)
            async for raw in self.twilio_ws.iter_text():
                await self._handle_twilio_message(json.loads(raw), rt_agent_client)
        except WebSocketDisconnect as e:
            if e.code == 1000:
                logger.info("Twilio WebSocket closed normally (call ended)")
            else:
                logger.warning(f"Twilio WebSocket disconnected: code={e.code}")
        except Exception as e:
            if _WsClosedOK and isinstance(e, _WsClosedOK):
                logger.info("Twilio WebSocket closed normally (call ended)")
            else:
                logger.error(f"Twilio WebSocket Error: {e}")
        finally:
            message_task.cancel()
            await rt_agent_client.close()

    async def _handle_twilio_message(
        self, data: dict, client: IRealtimeAgentClient
    ) -> None:
        event = data.get("event")
        if event == "start":
            self.stream_sid = data["start"]["streamSid"]
            client.stream_sid = self.stream_sid
            logger.info(f"Twilio stream started: {self.stream_sid}")
            await client.on_stream_start()

        elif event == "media":
            payload = data["media"]["payload"]
            chunk = base64.b64decode(payload)
            self.audio_accumulator.extend(chunk)

            if len(self.audio_accumulator) >= MIN_CHUNK_SIZE:
                await self._flush_audio(client)

        elif event == "stop":
            logger.info("Twilio stream stopped")

    async def _flush_audio(self, client: IRealtimeAgentClient) -> None:
        if not self.audio_accumulator:
            return

        audio_b64 = base64.b64encode(bytes(self.audio_accumulator)).decode()
        self.audio_accumulator.clear()
        # Each provider adapter converts µ-law 8kHz to its native format internally
        await client.send_audio(audio_b64)

    async def _handle_provider_event(self, data: dict) -> None:
        """
        Route provider events back to Twilio.
        No provider checks — adapters pre-convert audio to g711_ulaw when is_twilio=True.
        """
        event_type = data.get("type")

        if event_type == "response.audio.delta":
            try:
                audio_bytes = base64.b64decode(data["delta"])
                await self._send_audio_to_twilio(audio_bytes)
            except Exception as e:
                logger.error(f"Error processing audio delta: {e}")

        elif event_type in ["input_audio_buffer.speech_started", "interruption"]:
            await self._clear_twilio_buffer()

        elif event_type == "error":
            logger.error(f"Provider Error: {data}")

    async def _send_audio_to_twilio(self, audio_bytes: bytes) -> None:
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

    async def _clear_twilio_buffer(self) -> None:
        """Clear Twilio playback buffer on interruption."""
        if self.stream_sid and self.twilio_ws:
            await self.twilio_ws.send_json(
                {
                    "event": "clear",
                    "streamSid": self.stream_sid,
                }
            )
