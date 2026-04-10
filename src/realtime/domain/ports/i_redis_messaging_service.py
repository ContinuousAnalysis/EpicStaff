from abc import ABC, abstractmethod


class IRedisMessagingService(ABC):
    @abstractmethod
    async def async_subscribe(self, channel: str): ...

    @abstractmethod
    async def async_publish(self, channel: str, message: object) -> None: ...
