from abc import ABC, abstractmethod
from typing import Callable, Awaitable, Optional

from domain.ports.i_transcription_client import ITranscriptionClient
from domain.services.chat_buffer import ChatSummarizedBuffer
from src.shared.models import RealtimeAgentChatData


class ITranscriptionClientFactory(ABC):
    @abstractmethod
    def create(
        self,
        config: RealtimeAgentChatData,
        on_server_event: Callable[[dict], Awaitable[None]],
        buffer: ChatSummarizedBuffer,
    ) -> Optional[ITranscriptionClient]: ...
