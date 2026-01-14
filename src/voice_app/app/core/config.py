from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int
    
    # VoIP Settings
    # URL для провайдера (например, wss://your-id.ngrok-free.app/voice/stream)
    STREAM_URL: str
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    # Redis for state management (например, хранение ID звонка)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()