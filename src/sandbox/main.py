import asyncio
import json
import os
from pathlib import Path
from loguru import logger
from models import CodeTaskData
from services.redis_service import RedisService
from dynamic_venv_executor_chain import DynamicVenvExecutorChain

redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
redis_port = int(os.environ.get("REDIS_PORT", "6379"))
code_result_channel = os.environ.get("CODE_RESULT_CHANNEL", "code_results")
task_channel = os.environ.get("CODE_EXEC_TASK_CHANNEL", "code_exec_tasks")
output_path = Path(os.environ.get("OUTPUT_PATH", "executions"))
base_venv_path = Path(os.environ.get("BASE_VENV_PATH", "venvs"))

os.chdir("savefiles")


async def main():
    redis_service = RedisService(host=redis_host, port=redis_port)

    await redis_service.connect()

    executor_chain = DynamicVenvExecutorChain(
        output_path=output_path,
        base_venv_path=base_venv_path,
    )

    logger.info(f"Subscribed to channel '{task_channel}' for code execution tasks.")

    pubsub = await redis_service.async_subscribe(task_channel)

    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                logger.info(f"Received message: {message['data']}")

                data = json.loads(message["data"])
                code_task_data = CodeTaskData(**data)

                # Run the dynamic virtual environment execution chain
                result = await executor_chain.run(
                    venv_name=code_task_data.venv_name,
                    libraries=code_task_data.libraries,
                    code=code_task_data.code,
                    execution_id=code_task_data.execution_id,
                    entrypoint=code_task_data.entrypoint,
                    func_kwargs=code_task_data.func_kwargs,
                    global_kwargs=code_task_data.global_kwargs,
                )
                await redis_service.async_publish(
                    channel=code_result_channel, message=result.model_dump()
                )

            except Exception as e:
                logger.error(f"Error processing message: {e}")


if __name__ == "__main__":
    asyncio.run(main())
