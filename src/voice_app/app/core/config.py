from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int
    
    STREAM_URL: str
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: str
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()