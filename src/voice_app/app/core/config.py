from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int
    REALTIME_HOST: str = "realtime"
    REALTIME_PORT: str = "8050"
    DJANGO_HOST: str = "django_app"
    DJANGO_PORT: str = "8000"
    STREAM_URL: str
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    LOG_LEVEL: str = "INFO"
    VOICE_AGENT_ID: int = 2
    WEBHOOK_TOKEN: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def AI_WS_URL(self):
        return f"ws://{self.REALTIME_HOST}:{self.REALTIME_PORT}/"

    @property
    def INIT_API_URL(self):
        return f"ws://{self.DJANGO_HOST}:{self.DJANGO_PORT}/api/init-realtime/"


settings = Settings()
