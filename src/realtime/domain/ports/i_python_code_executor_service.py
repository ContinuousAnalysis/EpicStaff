from abc import ABC, abstractmethod
from typing import Any

from src.shared.models import PythonCodeData


class IPythonCodeExecutorService(ABC):
    @abstractmethod
    async def run_code(
        self,
        python_code_data: PythonCodeData,
        inputs: dict[str, Any],
        additional_global_kwargs: dict[str, Any] | None = None,
    ) -> dict: ...
