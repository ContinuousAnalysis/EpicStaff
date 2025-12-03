import websockets
import json
import base64
from typing import Optional, Callable, Dict, Any
from enum import Enum

SUBPROTOCOL = "openai-beta.realtime-v1"


class TurnDetectionMode(Enum):
    SERVER_VAD = "server_vad"
    MANUAL = "manual"


class RealtimeClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "wss://api.openai.com/v1/realtime",
        model: str = "gpt-4o-realtime-preview-2024-10-01",
        voice: str = "alloy",
        instructions: str = "You are a helpful assistant",
        temperature: float = 0.8,
        turn_detection_mode: TurnDetectionMode = TurnDetectionMode.MANUAL,
        audio_format: str = "g711_ulaw",
        on_text_delta: Optional[Callable[[str], None]] = None,
        on_audio_delta: Optional[Callable[[bytes], None]] = None,
        on_interrupt: Optional[Callable[[], None]] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.voice = voice
        self.instructions = instructions
        self.temperature = temperature
        self.turn_detection_mode = turn_detection_mode
        self.audio_format = audio_format

        self.on_text_delta = on_text_delta
        self.on_audio_delta = on_audio_delta
        self.on_interrupt = on_interrupt

        self.ws = None
        self._current_response_id = None
        self._current_item_id = None
        self._is_responding = False

    async def connect(self) -> None:
        """Establish WebSocket connection."""
        separator = "&" if "?" in self.base_url else "?"
        url = f"{self.base_url}{separator}model={self.model}"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        self.ws = await websockets.connect(
            url, subprotocols=[SUBPROTOCOL], additional_headers=headers
        )
        # NOTE: Our rely server will not handle it.
        session_config = {
            "modalities": ["text", "audio"],
            "instructions": self.instructions,
            "voice": self.voice,
            "input_audio_format": self.audio_format,
            "output_audio_format": self.audio_format,
            "turn_detection": (
                {"type": "server_vad"}
                if self.turn_detection_mode == TurnDetectionMode.SERVER_VAD
                else None
            ),
            "temperature": self.temperature,
        }

        await self.update_session(session_config)

    async def update_session(self, config: Dict[str, Any]) -> None:
        event = {"type": "session.update", "session": config}
        await self.ws.send(json.dumps(event))

    async def stream_audio(self, audio_chunk: bytes) -> None:
        """Stream raw audio data. Assumes input matches self.audio_format."""
        audio_b64 = base64.b64encode(audio_chunk).decode()
        await self.ws.send(
            json.dumps({"type": "input_audio_buffer.append", "audio": audio_b64})
        )

    async def handle_interruption(self, truncate_ms: int = 0):
        """Handle interruption and truncate audio history."""
        if not self._is_responding:
            return

        # 1. Cancel response
        await self.ws.send(json.dumps({"type": "response.cancel"}))

        # 2. Truncate history (Crucial for conversation continuity)
        if self._current_item_id:
            truncate_event = {
                "type": "conversation.item.truncate",
                "item_id": self._current_item_id,
                "content_index": 0,
                "audio_end_ms": truncate_ms,
            }
            await self.ws.send(json.dumps(truncate_event))

        self._is_responding = False

    async def handle_messages(self) -> None:
        try:
            async for message in self.ws:
                event = json.loads(message)
                event_type = event.get("type")

                if event_type == "response.created":
                    self._current_response_id = event.get("response", {}).get("id")
                    self._is_responding = True

                elif event_type == "response.output_item.added":
                    self._current_item_id = event.get("item", {}).get("id")

                elif event_type == "response.done":
                    self._is_responding = False

                elif event_type == "response.audio.delta":
                    if self.on_audio_delta:
                        await self.on_audio_delta(base64.b64decode(event["delta"]))

                elif event_type == "input_audio_buffer.speech_started":
                    # Trigger interruption logic
                    if self.on_interrupt:
                        # We await the user's callback first (to clear Twilio buffer)
                        await self.on_interrupt()

                    # Then we tell OpenAI to truncate
                    # Note: We hardcode a safe "heard" duration or need a tracker.
                    # For g711, 8000 bytes = 1000ms.
                    await self.handle_interruption(truncate_ms=1000)

                elif event_type == "error":
                    print(f"Error: {event['error']}")

        except websockets.exceptions.ConnectionClosed:
            print("Connection closed")

    async def close(self):
        if self.ws:
            await self.ws.close()
