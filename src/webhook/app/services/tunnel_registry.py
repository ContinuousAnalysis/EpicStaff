from loguru import logger

from app.providers.base import AbstractTunnelProvider
from app.providers.provider_factory import get_provider
from app.request_models import BaseTunnelConfigData, WebhookConfigData


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
        try:
            await tunnel.disconnect()
        except Exception as e:
            logger.error(f"Error disconnecting from tunnel {unique_id}, {e}")

    async def flush(self):
        for unique_id in list(self._tunnel_pool.keys()):
            await self.unregister(unique_id=unique_id)

    async def register_many(self, webhook_config_data: WebhookConfigData):
        await self.flush()
        for ngrok_config in webhook_config_data.ngrok_configs:
            try:
                await self.register(ngrok_config)
            except Exception as e:
                logger.error(f"Error registering {ngrok_config.unique_id}, {e}")
                await self.unregister(ngrok_config.unique_id)
            else:
                logger.info(f"Successfully added {ngrok_config.unique_id}")

        logger.debug(f"Current pool: {self._tunnel_pool.keys()}")

    async def get_tunnel(self, unique_id: str) -> AbstractTunnelProvider | None:
        return self._tunnel_pool.get(unique_id)


_tunnel_registry = None


def get_tunnel_registry() -> TunnelRegistry:
    """FastAPI dependency to get the singleton TunnelRegistry."""
    global _tunnel_registry
    if _tunnel_registry is None:
        _tunnel_registry = TunnelRegistry()

    return _tunnel_registry
