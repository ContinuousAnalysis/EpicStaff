from abc import ABC, abstractmethod

from domain.models.chat_mode import ChatMode


class IChatModeController(ABC):
    @abstractmethod
    def set_chat_mode(self, mode: ChatMode) -> None: ...
