import audioop
import base64
from typing import Any, Callable, Awaitable, Dict, List, Optional

from google import genai
from google.genai import types
from loguru import logger

from domain.models.realtime_tool import RealtimeTool
from infrastructure.providers.base_realtime_agent_client import BaseRealtimeAgentClient
from infrastructure.providers.gemini.event_handlers.gemini_client_event_handler import (
    GeminiClientEventHandler,
)
from infrastructure.providers.gemini.event_handlers.gemini_server_event_handler import (
    GeminiServerEventHandler,
)
from application.tool_manager_service import ToolManagerService


class GeminiRealtimeAgentClient(BaseRealtimeAgentClient):
    """
    Google Gemini Live API adapter.  Implements IRealtimeAgentClient via BaseRealtimeAgentClient.

    Audio paths:
    - Browser input: frontend sends 24kHz PCM via process_message() →
      GeminiClientEventHandler downsamples 24k→16k → send_realtime_input
    - Twilio input: VoiceCallService calls send_audio(ulaw8k_b64) →
      audioop converts µ-law 8kHz → PCM 16kHz → send_realtime_input
    - Browser output: Gemini outputs 24kHz PCM — passed through as-is
    - Twilio output: GeminiServerEventHandler converts PCM 24kHz → µ-law 8kHz
    """

    def __init__(
        self,
        api_key: str,
        connection_key: str,
        on_server_event: Optional[Callable[[dict], Awaitable[None]]] = None,
        tool_manager_service: ToolManagerService = None,
        rt_tools: Optional[List[RealtimeTool]] = None,
        model: str = "gemini-2.0-flash-live-001",
        voice: str = "Puck",
        instructions: str = "You are a helpful assistant",
        temperature: float = 1.0,
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

        self._genai_client = genai.Client(api_key=api_key)
        self._session = None
        self._session_cm = None

        # Stateful resampling state for Twilio paths
        self._resample_state_in = None   # µ-law 8kHz → PCM 16kHz
        self._resample_state_out = None  # PCM 24kHz → µ-law 8kHz

        self.server_event_handler = GeminiServerEventHandler(self)
        self.client_event_handler = GeminiClientEventHandler(self)

        self.tools = self._build_tools(rt_tools or [])

    def _build_tools(self, rt_tools: List[RealtimeTool]) -> list:
        """Convert RealtimeTool list to Gemini function_declarations format."""
        if not rt_tools:
            return []
        declarations = []
        for t in rt_tools:
            d = t if isinstance(t, dict) else t.model_dump()
            declarations.append(
                {
                    "name": d["name"],
                    "description": d.get("description", d["name"]),
                    "parameters": {
                        "type": "OBJECT",
                        "properties": d["parameters"]["properties"],
                        "required": d["parameters"].get("required", []),
                    },
                }
            )
        return [{"function_declarations": declarations}]

    async def connect(self) -> None:
        """Establish session with the Gemini Live API."""
        config: Dict[str, Any] = {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {"voice_name": self.voice}
                }
            },
            "system_instruction": types.Content(
                parts=[types.Part(text=self.instructions)]
            ),
        }
        if self.tools:
            config["tools"] = self.tools

        self._session_cm = self._genai_client.aio.live.connect(
            model=self.model, config=config
        )
        self._session = await self._session_cm.__aenter__()
        logger.info(f"Gemini Live connected: model={self.model}, voice={self.voice}")

    async def close(self) -> None:
        """Close the Gemini Live session."""
        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception as e:
                logger.warning(f"Gemini: error closing session: {e}")
            finally:
                self._session_cm = None
                self._session = None

    async def handle_messages(self) -> None:
        """Long-running loop receiving LiveServerMessage objects from Gemini."""
        logger.info("Gemini: Message handler started.")
        try:
            async for response in self._session.receive():
                try:
                    await self.server_event_handler.handle_event(response)
                except Exception as e:
                    logger.exception(f"Gemini: Error processing message: {e}")
        except Exception as e:
            logger.exception(f"Gemini: handle_messages error: {e}")
        finally:
            await self.close()

    async def send_audio(self, ulaw8k_b64: str) -> None:
        """
        Accept base64-encoded µ-law 8kHz audio from Twilio and forward to Gemini
        as PCM 16kHz (the format Gemini Live expects).
        """
        ulaw_bytes = base64.b64decode(ulaw8k_b64)
        pcm_8k = audioop.ulaw2lin(ulaw_bytes, 2)
        pcm_16k, self._resample_state_in = audioop.ratecv(
            pcm_8k, 2, 1, 8000, 16000, self._resample_state_in
        )
        await self._session.send_realtime_input(
            audio=types.Blob(data=pcm_16k, mime_type="audio/pcm;rate=16000")
        )

    async def process_message(self, message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process incoming message from the frontend WebSocket."""
        return await self.client_event_handler.handle_event(data=message)

    async def send_conversation_item_to_server(self, text: str) -> None:
        """Send a user text message to Gemini (used in LISTEN wake-word mode)."""
        await self._session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text=text)],
            ),
            turn_complete=True,
        )

    async def request_response(self, data: dict | None = None) -> None:
        """Gemini operates with automatic VAD — no explicit response trigger needed."""
        pass

    async def on_stream_start(self) -> None:
        """Twilio stream started — Gemini starts automatically, no action needed."""
        pass

    async def call_tool(
        self, call_id: str, tool_name: str, tool_arguments: Dict[str, Any]
    ) -> None:
        """Execute a tool via ToolManagerService and send the result back to Gemini."""
        try:
            tool_result = await self.tool_manager_service.execute(
                connection_key=self.connection_key,
                tool_name=tool_name,
                call_arguments=tool_arguments,
            )
            result_str = str(tool_result)
        except Exception as e:
            logger.error(f"Gemini: Tool execution failed: {e}")
            result_str = f"Error: {e}"

        await self._session.send_tool_response(
            function_responses=[
                types.FunctionResponse(
                    id=call_id,
                    response={"result": result_str},
                )
            ]
        )
