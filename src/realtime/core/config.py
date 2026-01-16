import sys
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PORT: int = 8050
    WORKERS: int = 1
    RELOAD: bool = False
    DEBUG_MODE: bool = False

    # --- Redis ---
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379

    # --- Redis Channels (Pub/Sub) ---
    KNOWLEDGE_SEARCH_GET_CHANNEL: str = "knowledge:search:get"
    KNOWLEDGE_SEARCH_RESPONSE_CHANNEL: str = "knowledge:search:response"
    REALTIME_AGENTS_SCHEMA_CHANNEL: str = "realtime_agents:schema"

    # --- Manager Service ---
    MANAGER_HOST: str = "127.0.0.1"
    MANAGER_PORT: int = 8001

    # --- Database (PostgreSQL) ---
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "admin"
    DB_HOST_NAME: str = "127.0.0.1"
    DB_PORT: int = 5432
    DB_NAME: str = "crew"
    DB_REALTIME_USER: str = "postgres"
    DB_REALTIME_PASSWORD: str = "admin"

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@"
            f"{self.DB_HOST_NAME}:{self.DB_PORT}/{self.DB_NAME}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_prefix="REALTIME_",
    )


@lru_cache
def get_settings():
    is_debug = "--debug" in sys.argv
    env_file = "debug.env" if is_debug else ".env"

    return Settings(_env_file=env_file, RELOAD=is_debug, DEBUG_MODE=is_debug)


settings = get_settings()
