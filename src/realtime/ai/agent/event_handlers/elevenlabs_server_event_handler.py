import base64
import json
import uuid
from typing import Any, Dict, Optional

import numpy as np
from db.database import save_realtime_session_item_to_db
from loguru import logger


class ElevenLabsServerEventHandler:
    """
    Мост между ElevenLabs и OpenAI Realtime Frontend.
    Решает проблему десинхронизации индексов и отсутствующих айтемов (Item not found).
    """

    def __init__(self, client):
        from ai.agent.elevenlabs_realtime_agent_client import (
            ElevenLabsRealtimeAgentClient,
        )

        self.client: ElevenLabsRealtimeAgentClient = client

        # Состояние текущего хода
        self._current_response_id: Optional[str] = None
        self._current_item_id: Optional[str] = None
        self._current_user_item_id: Optional[str] = None

        # Счетчик индексов внутри одного ответа (Критично для OpenAI протокола)
        self._current_output_index = 0

    async def _send_to_client(self, payload: Dict[str, Any]) -> None:
        """Гарантирует наличие event_id для каждого сообщения на фронтенд."""
        if "event_id" not in payload:
            payload["event_id"] = f"evt_{uuid.uuid4().hex[:16]}"
        await self.client.send_client(payload)

    async def _ensure_response_exists(self):
        """Создает оболочку response и ГАРАНТИРУЕТ, что сообщение пользователя идет первым."""
        if not self._current_response_id:
            self._current_response_id = f"resp_{uuid.uuid4().hex[:10]}"
            self._current_output_index = 0

            # 1. ГАРАНТИЯ ПОРЯДКА: Создаем пользователя ДО ассистента
            if not self._current_user_item_id:
                self._current_user_item_id = f"msg_user_{uuid.uuid4().hex[:10]}"
                await self._send_to_client(
                    {
                        "type": "conversation.item.created",
                        "item": {
                            "id": self._current_user_item_id,
                            "type": "message",
                            "role": "user",
                            "content": [{"type": "input_audio", "transcript": None}],
                        },
                    }
                )

            # 2. Создаем Response
            await self._send_to_client(
                {
                    "type": "response.created",
                    "response": {
                        "id": self._current_response_id,
                        "object": "realtime.response",
                        "status": "in_progress",
                        "output": [],
                    },
                }
            )

    async def _ensure_assistant_item(self):
        """Гарантирует наличие сообщения ассистента."""
        await self._ensure_response_exists()

        if not self._current_item_id:
            self._current_item_id = f"msg_{uuid.uuid4().hex[:10]}"
            # ФИКС: Запоминаем индекс конкретно для этого сообщения
            self._assistant_output_index = self._current_output_index

            agent_item = {
                "id": self._current_item_id,
                "type": "message",
                "role": "assistant",
                "status": "in_progress",
                "content": [{"type": "audio", "transcript": ""}],
            }

            await self._send_to_client(
                {
                    "type": "response.output_item.added",
                    "response_id": self._current_response_id,
                    "output_index": self._assistant_output_index,
                    "item": agent_item,
                }
            )

            await self._send_to_client(
                {"type": "conversation.item.created", "item": agent_item}
            )

            self._current_output_index += 1

    async def handle_event(self, data: Dict[str, Any]) -> None:
        event_type = data.get("type", "")
        logger.debug(f"EL Event Routing: {event_type}")

        handler = {
            "conversation_initiation_metadata": self._handle_initiation_metadata,
            "audio": self._handle_audio,
            "agent_response": self._handle_agent_response,
            "user_transcript": self._handle_user_transcript,
            "interruption": self._handle_interruption,
            "client_tool_call": self._handle_client_tool_call,
            "ping": self._handle_ping,
        }.get(event_type, self._handle_ignored)

        await handler(data)
        await save_realtime_session_item_to_db(
            data=data, connection_key=self.client.connection_key
        )

    async def _handle_initiation_metadata(self, data: Dict[str, Any]) -> None:
        meta = data.get("conversation_initiation_metadata_event", {})
        await self._send_to_client(
            {
                "type": "session.created",
                "session": {
                    "id": meta.get("conversation_id", ""),
                    "object": "realtime.session",
                    "provider": "elevenlabs",
                },
            }
        )

    async def _handle_audio(self, data: Dict[str, Any]) -> None:
        audio_event = data.get("audio_event", {})
        audio_b64 = (
            audio_event.get("audio_base_64")
            or data.get("audio_base_64")
            or data.get("chunk", "")
        )
        if not audio_b64:
            return

        await self._ensure_assistant_item()

        try:
            pcm_data = base64.b64decode(audio_b64)
            audio_array_16k = np.frombuffer(pcm_data, dtype=np.int16)
            if len(audio_array_16k) > 0:
                # Upsampling 16k -> 24k
                x_16k = np.arange(len(audio_array_16k))
                x_24k = np.linspace(
                    0, len(audio_array_16k) - 1, int(len(audio_array_16k) * 1.5)
                )
                audio_array_24k = np.interp(x_24k, x_16k, audio_array_16k).astype("<i2")

                await self._send_to_client(
                    {
                        "type": "response.audio.delta",
                        "response_id": self._current_response_id,
                        "item_id": self._current_item_id,
                        "output_index": self._assistant_output_index,  # Используем динамический индекс
                        "content_index": 0,
                        "delta": base64.b64encode(audio_array_24k.tobytes()).decode(
                            "utf-8"
                        ),
                    }
                )
        except Exception as e:
            logger.error(f"Audio upsample error: {e}")

    async def _handle_agent_response(self, data: Dict[str, Any]) -> None:
        agent_response_event = data.get("agent_response_event", {})
        text = agent_response_event.get("agent_response", "")

        if not self._current_response_id or not text:
            return

        rid, iid = self._current_response_id, self._current_item_id
        # Используем индекс ассистента, который мы сохранили ранее
        idx = getattr(self, "_assistant_output_index", 0)

        # --- ФИКС ТРАНСКРИПЦИИ: Отправляем Delta перед Done ---

        # 1. Говорим фронтенду: "Смотри, у нас тут текст появился"
        await self._send_to_client(
            {
                "type": "response.audio_transcript.delta",
                "response_id": rid,
                "item_id": iid,
                "output_index": idx,
                "content_index": 0,
                "delta": text,
            }
        )

        # 2. Финализируем транскрипт
        await self._send_to_client(
            {
                "type": "response.audio_transcript.done",
                "response_id": rid,
                "item_id": iid,
                "output_index": idx,
                "content_index": 0,
                "transcript": text,
            }
        )

        # 3. Финализируем аудио (обязательно для OpenAI SDK)
        await self._send_to_client(
            {
                "type": "response.audio.done",
                "response_id": rid,
                "item_id": iid,
                "output_index": idx,
                "content_index": 0,
            }
        )

        # 4. Закрываем айтем и ответ
        await self._send_to_client(
            {
                "type": "response.output_item.done",
                "response_id": rid,
                "item": {"id": iid, "status": "completed"},
            }
        )

        await self._send_to_client(
            {"type": "response.done", "response": {"id": rid, "status": "completed"}}
        )

        logger.info(f"Assistant turn finished with transcript: {text[:30]}...")

        # Сбрасываем состояние
        self._current_response_id = None
        self._current_item_id = None
        self._current_user_item_id = None
        self._current_output_index = 0

    async def _handle_user_transcript(self, data: Dict[str, Any]) -> None:
        user_transcription_event = data.get("user_transcription_event", {})
        text = user_transcription_event.get("user_transcript", "")
        if not text:
            return

        # Создаем пользователя, если он не был создан в _ensure_response_exists
        if not self._current_user_item_id:
            self._current_user_item_id = f"msg_user_{uuid.uuid4().hex[:10]}"
            await self._send_to_client(
                {
                    "type": "conversation.item.created",
                    "item": {
                        "id": self._current_user_item_id,
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_audio", "transcript": None}],
                    },
                }
            )

        await self._send_to_client(
            {
                "type": "conversation.item.input_audio_transcription.completed",
                "item_id": self._current_user_item_id,
                "content_index": 0,
                "transcript": text,
            }
        )
        # ФИКС: Удален self._current_user_item_id = None (перенесено в конец ответа)

    async def _handle_client_tool_call(self, data: Dict[str, Any]) -> None:
        """Обработка вызова инструмента с жестким соблюдением последовательности."""
        tool_call = data.get("client_tool_call", {})
        tool_call_id = tool_call.get("tool_call_id", "")
        tool_name = tool_call.get("tool_name", "")
        parameters = tool_call.get("parameters", {})

        # 1. Гарантируем наличие Response
        await self._ensure_response_exists()

        # 2. РЕГИСТРИРУЕМ айтем в разговоре ДО добавления в ответ
        await self._send_to_client(
            {
                "type": "conversation.item.created",
                "item": {
                    "id": tool_call_id,
                    "type": "function_call",
                    "status": "in_progress",
                    "name": tool_name,
                    "call_id": tool_call_id,
                    "arguments": "",
                },
            }
        )

        # 3. Добавляем его в текущий ответ под СЛЕДУЮЩИМ индексом
        await self._send_to_client(
            {
                "type": "response.output_item.added",
                "response_id": self._current_response_id,
                "output_index": self._current_output_index,
                "item": {
                    "id": tool_call_id,
                    "type": "function_call",
                    "name": tool_name,
                    "call_id": tool_call_id,
                    "arguments": "",
                },
            }
        )

        # 4. Финализируем аргументы
        await self._send_to_client(
            {
                "type": "response.function_call_arguments.done",
                "response_id": self._current_response_id,
                "item_id": tool_call_id,
                "output_index": self._current_output_index,
                "call_id": tool_call_id,
                "name": tool_name,
                "arguments": json.dumps(parameters),
            }
        )

        self._current_output_index += 1  # Увеличиваем индекс для будущего

        # 5. Выполняем саму тулзу
        logger.info(f"EL Tool Execution: {tool_name}")
        await self.client.call_tool(tool_call_id, tool_name, parameters)

    async def _handle_interruption(self, data: Dict[str, Any]) -> None:
        self._current_response_id = None
        self._current_item_id = None
        self._current_output_index = 0
        await self._send_to_client({"type": "input_audio_buffer.speech_started"})

    async def _handle_ping(self, data: Dict[str, Any]) -> None:
        event_id = data.get("ping_event", {}).get("event_id")
        await self.client.send_server({"type": "pong", "event_id": event_id})

    async def _handle_ignored(self, data: Dict[str, Any]) -> None:
        pass

    async def _handle_unknown(self, data: Dict[str, Any]) -> None:
        logger.warning(f"Unknown EL event: {data.get('type')}")
