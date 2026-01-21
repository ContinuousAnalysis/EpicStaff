from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int
    
    STREAM_URL: str
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: str = "6379"
    REDIS_PASSWORD: str
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def REDIS_URL(self):
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        
settings = Settings()