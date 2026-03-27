import hashlib
import json
import uuid
from typing import List

import httpx
from loguru import logger
from models.ai_models import RealtimeTool
from services.redis_service import RedisService
from utils.singleton_meta import SingletonMeta

_EL_API_BASE = "https://api.elevenlabs.io/v1"
_DEFAULT_LLM = "gpt-4o-mini"
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


class ElevenLabsAgentProvisioner(metaclass=SingletonMeta):
    def __init__(self, redis_service: RedisService):
        self.redis_service = redis_service

    async def _get_or_create_tool(
        self, client: httpx.AsyncClient, api_key: str, rt_tool: RealtimeTool
    ) -> str:
        headers = {"xi-api-key": api_key}
        # Имя, которое мы ищем (например, CLI_Executor_Tool)
        search_name = rt_tool.name.replace(" ", "_")

        # 1. Получаем список
        resp = await client.get(f"{_EL_API_BASE}/convai/tools", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        existing_tools = data.get("tools", [])

        # 2. Ищем тулзу, заходя внутрь tool_config
        existing_tool = next(
            (
                t
                for t in existing_tools
                if t.get("tool_config", {}).get("name") == search_name
            ),
            None,
        )

        # Подготовка полезной нагрузки для POST/PATCH
        # Мы отправляем только tool_config
        payload = {
            "tool_config": {
                "type": "client",
                "name": search_name,
                "description": rt_tool.description or f"Executes {rt_tool.name}",
                "expects_response": True,
                "parameters": rt_tool.parameters.model_dump(exclude_none=True),
            }
        }

        if existing_tool:
            # ФИКС: В твоем JSON ключ называется "id"
            t_id = existing_tool["id"]
            logger.info(
                f"EL Provisioner: Found existing tool '{search_name}' with ID: {t_id}. Updating..."
            )

            # Обновляем (PATCH)
            update_resp = await client.patch(
                f"{_EL_API_BASE}/convai/tools/{t_id}", headers=headers, json=payload
            )
            update_resp.raise_for_status()
            return t_id
        else:
            logger.info(
                f"EL Provisioner: Tool '{search_name}' not found. Creating new..."
            )
            # Создаем (POST)
            create_resp = await client.post(
                f"{_EL_API_BASE}/convai/tools", headers=headers, json=payload
            )
            create_resp.raise_for_status()

            # При создании ElevenLabs тоже возвращает "id"
            new_data = create_resp.json()
            return new_data["id"]

    async def get_or_create_agent(
        self,
        api_key: str,
        instructions: str,
        voice: str,
        rt_tools: List[RealtimeTool],
        llm_model: str,
    ) -> str:
        async with httpx.AsyncClient() as client:
            tool_ids = []
            for rt_tool in rt_tools:
                tid = await self._get_or_create_tool(client, api_key, rt_tool)
                tool_ids.append(tid)

            agent_name = "CrewAI-Main-Assistant"
            headers = {"xi-api-key": api_key}

            agents_resp = await client.get(
                f"{_EL_API_BASE}/convai/agents", headers=headers
            )
            agents_resp.raise_for_status()
            existing_agents = agents_resp.json().get("agents", [])

            agent = next((a for a in existing_agents if a["name"] == agent_name), None)

            agent_payload = self._build_agent_payload(
                agent_name, instructions, voice, rt_tools, tool_ids, llm_model
            )

            if agent:
                agent_id = agent["agent_id"]
                logger.info(
                    f"EL Provisioner: Found existing agent '{agent_name}'. Updating..."
                )

                res = await client.patch(
                    f"{_EL_API_BASE}/convai/agents/{agent_id}",
                    headers=headers,
                    json=agent_payload,
                )
                res.raise_for_status()
                return agent_id
            else:
                logger.info(
                    f"EL Provisioner: Agent '{agent_name}' not found. Creating..."
                )
                res = await client.post(
                    f"{_EL_API_BASE}/convai/agents/create",
                    headers=headers,
                    json=agent_payload,
                )
                res.raise_for_status()
                return res.json()["agent_id"]

    def _build_agent_payload(
        self,
        name: str,
        instructions: str,
        voice: str,
        rt_tools: List[RealtimeTool],
        tool_ids: List[str],
        llm_model: str,
    ) -> dict:
        """Вспомогательный метод для сборки структуры агента."""
        tools_config = []
        for i, tid in enumerate(tool_ids):
            tool_meta = rt_tools[i]
            params_data = tool_meta.parameters.model_dump(exclude_none=True)

            tools_config.append(
                {
                    "type": "client",
                    "tool_id": tid,
                    "name": tool_meta.name.replace(" ", "_"),
                    "description": tool_meta.description
                    or f"Executes {tool_meta.name}",
                    "expects_response": True,  # КРИТИЧЕСКИЙ ФИКС
                    "parameters": {
                        "type": "object",
                        "properties": params_data.get("properties", {}),
                        "required": params_data.get("required", []),
                    },
                }
            )

        voice_id = (
            voice
            if voice.lower() not in _OPENAI_VOICE_NAMES
            else "21m00Tcm4TlvDq8ikWAM"
        )

        return {
            "name": name,
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": instructions,
                        "llm": llm_model,
                        "first_message": "Hello! I am your AI assistant. How can I help you today?",
                        "tools": tools_config,
                    },
                },
                "tts": {"voice_id": voice_id, "model_id": "eleven_flash_v2"},
            },
        }

    async def _provision(
        self,
        api_key: str,
        instructions: str,
        voice: str,
        rt_tools: List[RealtimeTool],
        llm_model: str,
    ) -> str:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Создаем инструменты и получаем их ID
            tool_ids = []
            for t in rt_tools:
                tid = await self._create_tool(client, api_key, t)
                tool_ids.append(tid)

            # 2. Создаем агента, передавая и ID, и объекты инструментов для метаданных
            agent_id = await self._create_agent(
                client, api_key, instructions, voice, rt_tools, tool_ids, llm_model
            )
        return agent_id

    async def _create_tool(
        self, client: httpx.AsyncClient, api_key: str, rt_tool: RealtimeTool
    ) -> str:
        # Извлекаем свойства из параметров
        # Убедитесь, что rt_tool.parameters имеет поля properties и required
        params_data = rt_tool.parameters.model_dump(exclude_none=True)

        properties = params_data.get("properties", {})
        required = params_data.get("required", [])

        payload = {
            "tool_config": {
                "type": "client",
                "name": rt_tool.name.replace(" ", "_"),
                "description": rt_tool.description or f"Executes {rt_tool.name}",
                "expects_response": True,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            }
        }

        logger.info(
            f"Creating EL Tool '{rt_tool.name}' with schema: {json.dumps(payload['tool_config']['parameters'], indent=2)}"
        )

        resp = await client.post(
            f"{_EL_API_BASE}/convai/tools",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )

        if resp.status_code >= 400:
            logger.error(f"Failed to create tool: {resp.text}")

        resp.raise_for_status()
        return resp.json()["id"]

    async def _create_agent(
        self,
        client: httpx.AsyncClient,
        api_key: str,
        instructions: str,
        voice: str,
        rt_tools: List[RealtimeTool],
        tool_ids: List[str],
        llm_model: str,
    ) -> str:
        # Формируем конфиг инструментов, ВКЛЮЧАЯ схему параметров
        tools_config = []
        for i, tid in enumerate(tool_ids):
            tool_meta = rt_tools[i]
            # Извлекаем схему из объекта RealtimeTool
            params_data = tool_meta.parameters.model_dump(exclude_none=True)

            tools_config.append(
                {
                    "type": "client",
                    "tool_id": tid,  # Ссылка на библиотеку
                    "name": tool_meta.name.replace(" ", "_"),
                    "description": tool_meta.description
                    or f"Executes {tool_meta.name}",
                    # ВАЖНО: Добавляем параметры сюда тоже, чтобы агент их "увидел"
                    "parameters": {
                        "type": "object",
                        "properties": params_data.get("properties", {}),
                        "required": params_data.get("required", []),
                    },
                    "expects_response": True,
                }
            )

        voice_id = (
            voice
            if voice.lower() not in _OPENAI_VOICE_NAMES
            else "21m00Tcm4TlvDq8ikWAM"
        )

        payload: dict = {
            "name": f"crewai-agent-{uuid.uuid4().hex[:4]}",
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": instructions,
                        "llm": llm_model,
                        "first_message": "Hello! I am your AI assistant. How can I help you today?",
                        "tools": tools_config,  # Теперь здесь полная схема
                    },
                },
                "tts": {"voice_id": voice_id, "model_id": "eleven_flash_v2"},
            },
        }

        logger.debug(
            f"Provisioning Agent with FULL tool schema: {json.dumps(payload, indent=2)}"
        )

        resp = await client.post(
            f"{_EL_API_BASE}/convai/agents/create",
            headers={"xi-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )

        if resp.status_code >= 400:
            logger.error(f"EL Agent Creation Error: {resp.text}")
            resp.raise_for_status()

        return resp.json()["agent_id"]

    def _fingerprint(self, api_key, instructions, voice, rt_tools, llm_model) -> str:
        tools_repr = sorted(
            f"{t.name}:{t.parameters.model_dump_json()}" for t in rt_tools
        )
        raw = json.dumps(
            {
                "api_key": api_key,
                "instructions": instructions,
                "voice": voice,
                "tools": tools_repr,
                "llm": llm_model,
            },
            sort_keys=True,
        )
        return hashlib.md5(raw.encode()).hexdigest()
