import asyncio
import logging
from pyngrok import ngrok
from pyngrok.conf import PyngrokConfig
from app.providers.base import AbstractTunnelProvider
from typing import Optional

# Setting up basic logging to track reconnection events
logger = logging.getLogger(__name__)


class NgrokTunnel(AbstractTunnelProvider):
    """
    The ngrok-specific implementation of abstract tunnel with auto-reconnect logic.
    """

    def __init__(
        self,
        port: int,
        auth_token: Optional[str] = None,
        domain: Optional[str] = None,
        region: Optional[str] = None,
        reconnect_timeout: int = 10,
    ):
        super().__init__(port, auth_token, domain=domain)
        self._tunnel = None
        self._region = region
        self._reconnect_timeout = reconnect_timeout

        # State management flags
        self._is_running = False
        self._monitor_task: Optional[asyncio.Task] = None

        if not self._auth_token:
            raise ValueError("NgrokTunnel requires an auth_token.")

    async def connect(self):
        """
        Entry point to start the tunnel and the background monitoring task.
        """
        self._is_running = True

        # Initial connection attempt
        await self._establish_connection()

        # Start background monitor if not already running
        if self._monitor_task is None or self._monitor_task.done():
            self._monitor_task = asyncio.create_task(self._monitor_connection())

    async def _establish_connection(self):
        """
        Internal method to perform the actual socket/ngrok connection.
        """
        print(
            f"Attempting to connect ngrok tunnel on port {self._port} (Region: {self._region or 'us'})..."
        )

        # Use instance-specific config to avoid global state conflicts
        config = PyngrokConfig(
            auth_token=self._auth_token, region=self._region if self._region else "us"
        )

        def _start():
            # Standard pyngrok connection call

            return ngrok.connect(
                self._port, "http", domain=self._domain, pyngrok_config=config
            )

        try:
            # Offload blocking pyngrok call to a separate thread
            self._tunnel = await asyncio.to_thread(_start)
            self._public_url = self._tunnel.public_url
            print(f"Tunnel established: {self._public_url}")
        except Exception as e:
            logger.error(f"Failed to establish ngrok connection: {e}")
            self._tunnel = None
            raise

    async def _monitor_connection(self):
        """
        Infinite loop that checks tunnel health and triggers reconnection.
        """
        while self._is_running:
            await asyncio.sleep(self._reconnect_timeout)

            # Simple check: if _tunnel is None but service should be running -> reconnect
            if self._is_running and self._tunnel is None:
                try:
                    await self._establish_connection()
                except Exception as e:
                    logger.warning(
                        f"Reconnection attempt failed: {e}. Next try in {self._reconnect_timeout}s"
                    )

    async def disconnect(self):
        """
        Gracefully shut down the tunnel and stop the monitoring background task.
        """
        print(f"Disconnecting ngrok tunnel on port {self._port}...")
        self._is_running = False

        # Cancel the background monitor task
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

        # Close the actual ngrok tunnel
        if self._tunnel:
            url_to_disconnect = self._tunnel.public_url

            def _close():
                ngrok.disconnect(url_to_disconnect)

            await asyncio.to_thread(_close)
            self._tunnel = None
            logger.info(f"Ngrok tunnel {self._tunnel.public_url} closed successfully.")

        self._public_url = None
