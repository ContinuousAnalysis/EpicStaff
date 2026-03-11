from typing import Literal
from pydantic import BaseModel


class WebhookEventData(BaseModel):
    path: str
    payload: dict
    config_id: str | None = None


class BaseTunnelConfigData(BaseModel):
    name: str

    @classmethod
    def _tunnel_prefix(cls):
        return "base"

    @property
    def unique_id(self):
        return f"{self.__class__._tunnel_prefix()}:{self.name}"


class NgrokConfigData(BaseTunnelConfigData):
    auth_token: str
    domain: str | None = None
    region: Literal["us", "eu", "ap"] | None = None

    @classmethod
    def _tunnel_prefix(cls) -> str:
        return "ngrok"


class WebhookConfigData(BaseModel):
    ngrok_configs: list[NgrokConfigData]
    # other configs
    ...
