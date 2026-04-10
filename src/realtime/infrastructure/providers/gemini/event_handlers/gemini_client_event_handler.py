import base64
from typing import Any, Dict

import numpy as np
from google.genai import types
from loguru import logger


class GeminiClientEventHandler:
    """
    Translates frontend OpenAI-format events into Gemini Live API SDK calls.
    Includes real-time 24kHz to 16kHz audio resampling (browser path).
    """

    def __init__(self, client):
        from infrastructure.providers.gemini.gemini_realtime_agent_client import (
            GeminiRealtimeAgentClient,
        )

        self.client: GeminiRealtimeAgentClient = client
        self.event_map = {
            "input_audio_buffer.append": self._handle_audio_append,
            "input_audio_buffer.commit": self._handle_noop,
            "response.create": self._handle_noop,
            "response.cancel": self._handle_noop,
            "conversation.item.create": self._handle_noop,
            "session.update": self._handle_noop,
        }

    async def handle_event(self, data: Dict[str, Any]) -> None:
        event_type = data.get("type", "")
        handler = self.event_map.get(event_type, self._handle_unknown)
        await handler(data)

    async def _handle_audio_append(self, data: Dict[str, Any]) -> None:
        audio_b64 = data.get("audio", "")
        if not audio_b64:
            return

        try:
            # Decode incoming PCM 16-bit Mono 24kHz from browser
            pcm_data_24k = base64.b64decode(audio_b64)
            audio_array_24k = np.frombuffer(pcm_data_24k, dtype=np.int16)

            # Downsample 24kHz → 16kHz (factor 2/3), same approach as ElevenLabs
            indices = np.arange(0, len(audio_array_24k), 1.5).astype(np.int32)
            audio_array_16k = audio_array_24k[indices]
            pcm16k_bytes = audio_array_16k.tobytes()

            await self.client._session.send_realtime_input(
                audio=types.Blob(data=pcm16k_bytes, mime_type="audio/pcm;rate=16000")
            )
        except Exception as e:
            logger.error(f"Gemini client handler: failed to process audio chunk: {e}")

    async def _handle_noop(self, data: Dict[str, Any]) -> None:
        pass

    async def _handle_unknown(self, data: Dict[str, Any]) -> None:
        logger.debug(
            f"Gemini client handler: unhandled event type '{data.get('type')}'"
        )
