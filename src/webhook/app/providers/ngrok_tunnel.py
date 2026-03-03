import asyncio
from typing import Optional

from loguru import logger
from pyngrok import ngrok
from pyngrok.conf import PyngrokConfig

from app.providers.base import AbstractTunnelProvider


class NgrokTunnel(AbstractTunnelProvider):
    """
    The ngrok-specific implementation of abstract tunnel with auto-reconnect logic
    and protection against race conditions.
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

        self._is_running = False
        self._monitor_task: Optional[asyncio.Task] = None

        self._lock = asyncio.Lock()

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
        async with self._lock:
            if not self._is_running or self._tunnel is not None:
                return

        print(
            f"Attempting to connect ngrok tunnel on port {self._port} "
            f"(Region: {self._region or 'us'})..."
        )

        self._config = PyngrokConfig(
            auth_token=self._auth_token, region=self._region if self._region else "us"
        )

        def _start():
            return ngrok.connect(
                self._port, "http", domain=self._domain, pyngrok_config=self._config
            )

        try:
            new_tunnel = await asyncio.to_thread(_start)

            async with self._lock:
                if not self._is_running:
                    print(
                        "Disconnect called during connection! Rolling back new tunnel..."
                    )

                    def _rollback():
                        ngrok.disconnect(
                            new_tunnel.public_url, pyngrok_config=self._config
                        )

                    await asyncio.to_thread(_rollback)
                    return

                self._tunnel = new_tunnel
                self._public_url = self._tunnel.public_url
                print(f"Tunnel established: {self._public_url}")

        except Exception as e:
            logger.error(f"Failed to establish ngrok connection: {e}")
            raise

    async def _monitor_connection(self):
        """
        Infinite loop that checks tunnel health and triggers reconnection safely.
        """
        try:
            while self._is_running:
                await asyncio.sleep(self._reconnect_timeout)

                if not self._is_running:
                    break

                async with self._lock:
                    needs_reconnect = self._tunnel is None

                if needs_reconnect:
                    try:
                        await self._establish_connection()
                    except asyncio.CancelledError:
                        raise
                    except Exception as e:
                        logger.warning(
                            f"Reconnection attempt failed: {e}. "
                            f"Next try in {self._reconnect_timeout}s"
                        )
        except asyncio.CancelledError:
            logger.debug("Monitor task received cancellation.")
            raise
        finally:
            self._is_running = False

    async def disconnect(self):
        print(f"Disconnecting ngrok tunnel on port {self._port}...")
        self._is_running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await asyncio.wait_for(self._monitor_task, timeout=1.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._monitor_task = None

        async with self._lock:
            logger.debug(f"self._tunnel={self._tunnel}")
            if self._tunnel:
                url_to_disconnect = self._tunnel.public_url

                def _close():
                    ngrok.disconnect(url_to_disconnect, pyngrok_config=self._config)

                try:
                    await asyncio.to_thread(_close)
                    logger.info(
                        f"Ngrok tunnel {url_to_disconnect} closed successfully."
                    )
                except Exception:
                    logger.exception(f"Failed to disconnect tunnel {url_to_disconnect}")
                finally:
                    self._tunnel = None
                    self._public_url = None
