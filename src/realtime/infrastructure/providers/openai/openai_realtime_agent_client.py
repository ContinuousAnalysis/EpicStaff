import websockets
import json
from typing import Optional, List, Dict, Any, Callable, Awaitable
from enum import Enum

from infrastructure.providers.openai.event_handlers.agent_client_event_handler import (
    ClientEventHandler,
)
from infrastructure.providers.openai.event_handlers.agent_server_event_handler import (
    ServerEventHandler,
)
from infrastructure.providers.base_realtime_agent_client import BaseRealtimeAgentClient
from domain.models.realtime_tool import RealtimeTool
from application.tool_manager_service import ToolManagerService
from loguru import logger


class TurnDetectionMode(Enum):
    SERVER_VAD = "server_vad"
    MANUAL = "manual"


class OpenaiRealtimeAgentClient(BaseRealtimeAgentClient):
    """
    OpenAI Realtime API adapter.  Implements IRealtimeAgentClient via BaseRealtimeAgentClient.
    """

    def __init__(
        self,
        api_key: str,
        connection_key: str,
        on_server_event: Optional[Callable[[dict], Awaitable[None]]] = None,
        tool_manager_service: ToolManagerService = None,
        rt_tools: Optional[List[RealtimeTool]] = None,
        model: str = "gpt-4o-mini-realtime-preview-2024-12-17",
        voice: str = "alloy",
        instructions: str = "You are a helpful assistant",
        temperature: float = 0.8,
        turn_detection_mode: TurnDetectionMode = TurnDetectionMode.SERVER_VAD,
        input_audio_format: str = "pcm16",
        output_audio_format: str = "pcm16",
    ):
        super().__init__(
            api_key=api_key,
            connection_key=connection_key,
            on_server_event=on_server_event,
        )

        self.tool_manager_service = tool_manager_service
        self.model = model
        self.voice = voice
        self.instructions = instructions
        self.temperature = temperature
        self.base_url = "wss://api.openai.com/v1/realtime"
        self.turn_detection_mode = turn_detection_mode
        self.input_audio_format = input_audio_format
        self.output_audio_format = output_audio_format

        self.server_event_handler = ServerEventHandler(self)
        self.client_event_handler = ClientEventHandler(self)
        if rt_tools is None:
            rt_tools = []

        self.tools = []
        for rt_tool in rt_tools:
            if not isinstance(rt_tool, dict):
                rt_tool = rt_tool.model_dump()
            self.tools.append(rt_tool)

        self._current_response_id = None
        self._current_item_id = None
        self._is_responding = False
        self._print_input_transcript = False
        self._output_transcript_buffer = ""

    async def connect(self) -> None:
        """Establish WebSocket connection with the Realtime API."""
        url = f"{self.base_url}?model={self.model}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        self.ws = await websockets.connect(url, extra_headers=headers)

        await self.update_session(
            config={
                "modalities": ["text", "audio"],
                "instructions": self.instructions,
                "voice": self.voice,
                "tools": self.tools,
                "tool_choice": "auto",
                "temperature": self.temperature,
                "turn_detection": {
                    "type": self.turn_detection_mode.value,
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
                "input_audio_format": self.input_audio_format,
                "output_audio_format": self.output_audio_format,
            }
        )

    async def update_session(self, config: Dict[str, Any]) -> None:
        """Update session configuration."""
        voice = config.get("voice", self.voice)
        turn_detection = config.get("turn_detection")
        tool_choice = config.get("tool_choice", "auto")
        input_audio_transcription = config.get(
            "input_audio_transcription", {"model": "whisper-1"}
        )
        modalities = config.get("modalities", ["text", "audio"])
        temperature = config.get("temperature", self.temperature)
        input_audio_format = config.get("input_audio_format", "pcm16")
        output_audio_format = config.get("output_audio_format", "pcm16")
        data = {
            "modalities": modalities,
            "instructions": self.instructions,
            "voice": voice,
            "input_audio_format": input_audio_format,
            "output_audio_format": output_audio_format,
            "input_audio_transcription": input_audio_transcription,
            "turn_detection": turn_detection,
            "tools": self.tools,
            "tool_choice": tool_choice,
            "temperature": temperature,
        }

        event = {"type": "session.update", "session": data}

        await self.send_server(event)

    async def request_response(self, data: dict | None = None) -> None:
        """Request a response from the API. Needed when using manual mode."""
        response = {"modalities": ["text", "audio"], "tools": self.tools}

        if data is not None:
            client_response: dict = data.get("response")

            if client_response is not None:
                client_response_modalities = client_response.get(
                    "modalities", ["text", "audio"]
                )
                if client_response_modalities is not None:
                    response["modalities"] = client_response_modalities

        event = {
            "type": "response.create",
            "response": response,
        }

        await self.send_server(event)

    async def on_stream_start(self) -> None:
        """Twilio stream started — trigger initial response."""
        await self.send_server(
            {"type": "response.create", "response": {"modalities": ["text", "audio"]}}
        )

    async def send_audio(self, ulaw8k_b64: str) -> None:
        """
        Accept base64-encoded µ-law 8kHz audio from Twilio and forward to OpenAI.
        OpenAI is configured with input_audio_format='g711_ulaw' for the Twilio path,
        so no conversion is needed — pass through as-is.
        """
        await self.send_server(
            {"type": "input_audio_buffer.append", "audio": ulaw8k_b64}
        )

    async def send_function_result(self, call_id: str, result: Any) -> None:
        """Send function call result back to the API."""
        event = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": result,
            },
        }
        await self.send_server(event)

    async def call_tool(
        self, call_id: str, tool_name: str, tool_arguments: Dict[str, Any]
    ) -> None:
        tool_result = await self.tool_manager_service.execute(
            connection_key=self.connection_key,
            tool_name=tool_name,
            call_arguments=tool_arguments,
        )

        await self.send_function_result(call_id, str(tool_result))

    async def process_message(
        self, message: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Process incoming message from the frontend WebSocket."""
        return await self.client_event_handler.handle_event(data=message)

    async def handle_messages(self) -> None:
        """Handle incoming messages from the OpenAI API."""
        logger.info("Starting message handler...")
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)

                    await self.server_event_handler.handle_event(data)

                except json.JSONDecodeError:
                    logger.exception("Failed to decode API message")
                except Exception as e:
                    logger.exception(f"Error processing API message: {str(e)}")

        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
        except Exception as e:
            logger.exception(f"Error in message handler: {str(e)}")

    async def send_conversation_item_to_server(self, text: str):
        event = {
            "type": "conversation.item.create",
            "item": {
                "id": "dont_show_it",
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": text}],
            },
        }
        await self.send_server(event=event)
