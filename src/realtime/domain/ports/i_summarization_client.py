from abc import ABC, abstractmethod


class ISummarizationClient(ABC):
    @abstractmethod
    async def summarize_buffer(self, to_summarize: str) -> str: ...

    @abstractmethod
    async def summarize_chunks(self, to_summarize: str) -> str: ...
