from datetime import datetime
import os
from typing import Any
import uuid
import json
from tables.models import PythonCodeResult
from tables.request_models import CodeTaskData
from tables.models import PythonCode
from tables.services.redis_service import RedisService
from utils.singleton_meta import SingletonMeta


class RunPythonCodeService(metaclass=SingletonMeta):

    def __init__(self, redis_service: RedisService):
        self.redis_service = redis_service
        self.code_exec_task_channel: str = os.environ.get(
            "CODE_EXEC_TASK_CHANNEL", "code_exec_tasks"
        )

    def run_code(
        self,
        python_code_id: int,
        varaibles: dict,
        additional_global_kwargs: dict[str, Any] | None = None,
        wait_for_result: bool = False,
    ) -> str | dict | None:
        """
        Sends a Redis request to execute Python code.

        Args:
            python_code_id (int): The ID of the Python code in the database.
            variables (dict): A dictionary containing key-value pairs to be used as input for the Python code.
            additional_global_kwargs (dict[str, Any], optional): Additional global keyword arguments to be passed to the Python code. Defaults to None.
        Returns:
            str: The execution ID of the Python code.
            or
            dict: Code execution details and result.
        """
        additional_global_kwargs = additional_global_kwargs or {}

        python_code: PythonCode = PythonCode.objects.get(id=python_code_id)
        execution_id = self.gen_execution_id()
        code_task_data = CodeTaskData(
            venv_name=f"venv_{python_code_id}",
            libraries=python_code.get_libraries_list(),
            code=python_code.code,
            entrypoint=python_code.entrypoint,
            func_kwargs=varaibles,
            execution_id=execution_id,
            global_kwargs={**python_code.global_kwargs, **additional_global_kwargs},
        )

        channel = self.code_exec_task_channel
        payload = code_task_data.model_dump_json()

        pubsub = None
        if wait_for_result:
            pubsub = self.redis_service.redis_client.pubsub()
            pubsub.subscribe("code_results")

        self.redis_service.redis_client.publish(channel, payload)

        if not wait_for_result:
            return execution_id

        try:
            for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                try:
                    raw_data = json.loads(message["data"])

                    if raw_data.get("execution_id") != execution_id:
                        continue

                    return raw_data

                except (json.JSONDecodeError, Exception) as e:
                    print(f"Error parsing result: {e}")
                    continue

        finally:
            if pubsub:
                pubsub.unsubscribe()
                pubsub.close()

    def gen_execution_id(self):
        now = datetime.now()
        short_uuid = str(uuid.uuid4())[:4]
        formatted_time = now.strftime(
            f"%d-%m-%Y_%H-%M-%S-{now.microsecond // 1000:03d}"
        )
        return f"{formatted_time}@{short_uuid}"
