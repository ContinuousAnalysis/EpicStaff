from loguru import logger

from app.providers.base import AbstractTunnelProvider
from app.providers.provider_factory import get_provider
from app.request_models import WebhookConfigData, BaseTunnelConfigData, NgrokConfigData


class TunnelRegistry:

    def __init__(self):
        self._tunnel_pool: dict[str, AbstractTunnelProvider] = dict()

    async def register(self, config: BaseTunnelConfigData):
        tunnel = get_provider(config)
        self._tunnel_pool[config.unique_id] = tunnel
        await tunnel.connect()

    async def unregister(self, unique_id: str):
        if unique_id not in self._tunnel_pool:
            logger.warning(
                f"Tunnel with unique_id {unique_id} was not found in registry, skipping..."
            )
            return
        tunnel = self._tunnel_pool.pop(unique_id)
        await tunnel.disconnect()

    async def flush(self):
        for unique_id in list(self._tunnel_pool.keys()):
            await self.unregister(unique_id=unique_id)

    async def register_many(self, webhook_config_data: WebhookConfigData):
        await self.flush()
        for ngrok_config in webhook_config_data.ngrok_configs:
            await self.register(ngrok_config)

    async def get_tunnel(self, unique_id: str) -> AbstractTunnelProvider | None:
        return self._tunnel_pool.get(unique_id)


_tunnel_registry = None


def get_tunnel_registry() -> TunnelRegistry:
    """FastAPI dependency to get the singleton TunnelRegistry."""
    global _tunnel_registry
    if _tunnel_registry is None:
        _tunnel_registry = TunnelRegistry()

    return _tunnel_registry
