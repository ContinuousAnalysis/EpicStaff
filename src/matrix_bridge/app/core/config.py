from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    matrix_bridge_port: int = 8060
    matrix_homeserver_url: str = "http://epicstaff-synapse:8008"
    matrix_domain: str = "localhost"
    matrix_as_token: str = ""
    matrix_hs_token: str = ""
    django_api_url: str = "http://localhost/api"
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: str = ""
    session_status_channel: str = "sessions:session_status"
    matrix_bots_update_channel: str = "matrix:bots:update"


@lru_cache
def get_settings() -> Settings:
    return Settings()
