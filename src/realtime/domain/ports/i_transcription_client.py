from abc import ABC, abstractmethod
from typing import Optional


class ITranscriptionClient(ABC):
    @abstractmethod
    async def connect(self) -> None: ...

    @abstractmethod
    async def handle_messages(self) -> None: ...

    @abstractmethod
    async def process_message(self, message: dict) -> Optional[dict]: ...

    @abstractmethod
    async def close(self) -> None: ...
