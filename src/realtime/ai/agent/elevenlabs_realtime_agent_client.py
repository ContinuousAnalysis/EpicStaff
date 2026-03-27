import json
import uuid
import websockets
from typing import Optional, List, Dict, Any, Callable, Awaitable
from loguru import logger
from starlette.websockets import WebSocketDisconnect

from models.ai_models import RealtimeTool
from services.tool_manager_service import ToolManagerService

# Список имен голосов OpenAI для фильтрации
_OPENAI_VOICE_NAMES = {
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
    "verse",
}


class ElevenLabsRealtimeAgentClient:
    """
    Клиент для взаимодействия с ElevenLabs Conversational AI API.
    Адаптирован под интерфейс OpenAI Realtime для полной совместимости с ChatExecutor.
    """

    def __init__(
        self,
        api_key: str,
        connection_key: str,
        on_server_event: Optional[Callable[[dict], Awaitable[None]]] = None,
        tool_manager_service: ToolManagerService = None,
        rt_tools: Optional[List[RealtimeTool]] = None,
        voice: str = "21m00Tcm4TlvDq8ikWAM",  # Rachel
        instructions: str = "You are a helpful assistant",
        temperature: float = 0.8,
        agent_id: str = "",
        agent_provisioner: Any = None,
        llm_model: str = "gpt-4o-mini",
    ):
        self.api_key = api_key
        self.connection_key = connection_key
        self.on_server_event = on_server_event
        self.tool_manager_service = tool_manager_service
        self.rt_tools = rt_tools or []
        self.voice = voice
        self.instructions = instructions
        self.temperature = temperature
        self.agent_id = agent_id
        self.agent_provisioner = agent_provisioner
        self.llm_model = llm_model

        self.ws = None
        self.base_url = "wss://api.elevenlabs.io/v1/convai/conversation"

        # Обработчики событий (Lazy import)
        from ai.agent.event_handlers.elevenlabs_server_event_handler import (
            ElevenLabsServerEventHandler,
        )
        from ai.agent.event_handlers.elevenlabs_client_event_handler import (
            ElevenLabsClientEventHandler,
        )

        self.server_event_handler = ElevenLabsServerEventHandler(self)
        self.client_event_handler = ElevenLabsClientEventHandler(self)

        self.tools = []
        for rt_tool in self.rt_tools:
            if not isinstance(rt_tool, dict):
                rt_tool = rt_tool.model_dump()
            self.tools.append(rt_tool)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def connect(self) -> None:
        """Установка соединения и создание агента."""
        if not self.agent_id:
            logger.info("ElevenLabs: Provisioning agent...")
            self.agent_id = await self.agent_provisioner.get_or_create_agent(
                api_key=self.api_key,
                instructions=self.instructions,
                voice=self.voice,
                rt_tools=self.rt_tools,
                llm_model=self.llm_model,
            )

        url = f"{self.base_url}?agent_id={self.agent_id}"
        headers = {"xi-api-key": self.api_key}

        self.ws = await websockets.connect(url, extra_headers=headers)
        logger.info(f"ElevenLabs WebSocket connected: agent_id={self.agent_id}")

        # Начальный конфиг — всегда отправляем, чтобы ElevenLabs начал разговор
        # (без этого сообщения ElevenLabs не шлёт first_message и аудио не идёт)
        config_override = {}
        if self.voice and self.voice.lower() not in _OPENAI_VOICE_NAMES:
            config_override["tts"] = {"voice_id": self.voice}

        await self.send_server(
            {
                "type": "conversation_initiation_client_data",
                "conversation_config_override": config_override,
            }
        )

    async def close(self) -> None:
        """Закрытие WebSocket."""
        if self.ws:
            await self.ws.close()

    # ------------------------------------------------------------------
    # Communication Helpers
    # ------------------------------------------------------------------

    async def send_client(self, data: dict):
        if "event_id" not in data:
            data["event_id"] = f"evt_{uuid.uuid4().hex[:16]}"

        if self.on_server_event:
            await self.on_server_event(data)

    async def send_server(self, event: dict):
        """Отправка сообщения в ElevenLabs."""
        if self.ws:
            await self.ws.send(json.dumps(event))

    # ------------------------------------------------------------------
    # Message Loops & Processing
    # ------------------------------------------------------------------

    async def handle_messages(self) -> None:
        """Слушатель сообщений ElevenLabs."""
        logger.info("ElevenLabs: Message handler started.")
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)

                    # Пинг-понг для удержания соединения
                    if data.get("type") == "ping":
                        event_id = data.get("ping_event", {}).get("event_id")
                        await self.send_server({"type": "pong", "event_id": event_id})
                        continue

                    await self.server_event_handler.handle_event(data)

                except WebSocketDisconnect:
                    logger.info(
                        "ElevenLabs: Client disconnected, stopping message handler"
                    )
                    break
                except Exception as e:
                    logger.exception(f"ElevenLabs: Error processing message: {str(e)}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("ElevenLabs: Connection closed")
        finally:
            await self.close()

    async def process_message(
        self, message: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Обработка сообщений от фронтенда."""
        return await self.client_event_handler.handle_event(data=message)

    async def send_conversation_item_to_server(self, text: str):
        """Отправка текста пользователя в ElevenLabs."""
        await self.send_server({"type": "user_message", "text": text})

    # ------------------------------------------------------------------
    # Tools & Results
    # ------------------------------------------------------------------

    async def send_function_result(self, call_id: str, result: Any) -> None:
        """
        Отправка результата выполнения инструмента.
        """
        # Парсим чистый результат (stdout или строку)
        clean_result = ""
        if isinstance(result, dict):
            clean_result = (
                result.get("result_data") or result.get("stdout") or str(result)
            )
        else:
            clean_result = str(result)

        clean_result = clean_result.strip('"').replace("\\n", "\n")

        # 1. Шлем в ElevenLabs (для озвучки)
        await self.send_server(
            {
                "type": "client_tool_result",
                "tool_call_id": call_id,
                "result": clean_result,
                "is_error": False,
            }
        )

        # 2. Шлем на Фронтенд (для отображения в чате)
        # Здесь send_client сам добавит event_id
        await self.send_client(
            {
                "type": "conversation.item.created",
                "item": {
                    "id": f"res_{uuid.uuid4().hex[:10]}",
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": clean_result,
                },
            }
        )

        # Закрываем ответ для визуализации
        await self.send_client(
            {"type": "response.done", "response": {"status": "completed"}}
        )

    async def call_tool(
        self, call_id: str, tool_name: str, tool_arguments: Dict[str, Any]
    ) -> None:
        """Запуск инструмента через ToolManagerService."""
        logger.info(f"ElevenLabs: Calling tool {tool_name}")
        try:
            tool_result = await self.tool_manager_service.execute(
                connection_key=self.connection_key,
                tool_name=tool_name,
                call_arguments=tool_arguments,
            )
            await self.send_function_result(call_id, tool_result)
        except Exception as e:
            logger.error(f"Tool execution failed: {str(e)}")
            await self.send_function_result(call_id, f"Error: {str(e)}")

    async def request_response(self, data: dict | None = None) -> None:
        """ElevenLabs работает в авто-режиме."""
        pass
