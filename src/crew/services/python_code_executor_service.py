import uuid
import asyncio
from typing import Any

from loguru import logger
from utils.singleton_meta import SingletonMeta
from services.redis_service import RedisService
from models.request_models import CodeResultData, CodeTaskData, PythonCodeData


class RunPythonCodeService(metaclass=SingletonMeta):
    def __init__(self, redis_service: RedisService):
        self.redis_service = redis_service

    async def run_code(
        self,
        python_code_data: PythonCodeData,
        inputs: dict[str, Any],
        additional_global_kwargs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        additional_global_kwargs = additional_global_kwargs or {}
        venv_name = python_code_data.venv_name
        code = python_code_data.code
        entrypoint = python_code_data.entrypoint
        libraries = python_code_data.libraries

        global_kwargs = python_code_data.global_kwargs or {}

        unique_task_id = str(uuid.uuid4())
        code_task_data = CodeTaskData(
            venv_name=venv_name,
            libraries=libraries,
            code=code,
            execution_id=unique_task_id,
            entrypoint=entrypoint,
            func_kwargs=inputs,
            global_kwargs={
                **global_kwargs,
                **additional_global_kwargs,
            },
        )
        
        pubsub = await self.redis_service.async_subscribe("code_results")
        await self.redis_service.async_publish("code_exec_tasks", code_task_data.model_dump())
        logger.info("Waiting for code_results")

        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.01)
            if message:
                code_result_data = CodeResultData.model_validate_json(message["data"])
                if code_result_data.execution_id == unique_task_id:
                    return code_result_data.model_dump()
            await asyncio.sleep(0.1)
