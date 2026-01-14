from abc import ABC, abstractmethod

class BaseVoiceProvider(ABC):
    @abstractmethod
    def get_init_response(self, stream_url: str) -> str:
        """Инструкция для провайдера для начала стрима"""
        pass

    @abstractmethod
    def extract_audio(self, message: str) -> bytes:
        """Извлечение mu-law аудио из сообщения"""
        pass

    @abstractmethod
    def format_response(self, pcm16_audio: bytes) -> str:
        """Подготовка аудио для отправки обратно провайдеру"""
        pass