import asyncio
import uvicorn
import sys
from app.core.config import settings 
from fastapi import FastAPI
from app.main import create_app
from app.providers.base import AbstractTunnelProvider
from app.providers import get_provider, ProviderNotFoundException
from typing import Optional


PORT = 8000

class WebhookService:
    """
    Orchestrates the web server and the tunnel provider.
    The tunnel provider is optional.
    """
    def __init__(self, app: FastAPI, port: int, tunnel_provider: Optional[AbstractTunnelProvider] = None):
        self.app = app
        self.tunnel = tunnel_provider
        self.port = port
        self.server: Optional[uvicorn.Server] = None

    async def run(self):
        """Connect the tunnel (if provided), then start the server."""
        try:
            if self.tunnel:
                # A tunnel provider was given, so connect it.
                await self.tunnel.connect()
                print("-------------------------------------------")
                print(f" ✅ Tunnel is LIVE: {self.tunnel.public_url}")
                print(f" 🚀 Endpoint is: {self.tunnel.public_url}/webhooks/<custom_id>/")
                print("-------------------------------------------")
            else:
                # No tunnel provider. We are in local-only mode.
                print("-------------------------------------------")
                print(" ✅ Running in LOCAL-ONLY mode (no tunnel).")
                print(f" 🚀 Endpoint is: http://127.0.0.1:{self.port}/webhooks/<custom_id>/")
                print("-------------------------------------------")

            # Configure and start Uvicorn
            config = uvicorn.Config(self.app, host="127.0.0.1", port=self.port)
            self.server = uvicorn.Server(config)
            
            print("Starting Uvicorn server... (Press Ctrl+C to quit)")
            await self.server.serve()

        except KeyboardInterrupt:
            print("\nShutting down...")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
        finally:
            await self.shutdown()

    async def shutdown(self):
        """Cleanly shut down the server and the tunnel (if it exists)."""
        if self.server and self.server.started:
            print("Stopping Uvicorn server...")
            self.server.should_exit = True
        
        if self.tunnel and self.tunnel.public_url:
            await self.tunnel.disconnect()
            
        print("Service stopped.")

async def main():
    """
    This is the "Composition Root".
    Settings are already loaded, so we just build the app.
    """
    # 1. Create the application
    # This works because all sub-modules (like redis_service)
    # will import the already-populated 'settings' object.
    app = create_app()
    
    # 2. Conditionally create the tunnel
    tunnel_provider: Optional[AbstractTunnelProvider] = None
    
    # We can now safely access the global 'settings' object
    if settings.USE_TUNNEL:
        print(f"Tunnel enabled. Attempting to use provider: '{settings.WEBHOOK_TUNNEL}'")
        try:
            tunnel_provider = get_provider(
                provider_name=settings.WEBHOOK_TUNNEL,
                port=PORT,
                auth_token=settings.WEBHOOK_AUTH
            )
        except ProviderNotFoundException as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
        except ValueError as e:
            print(f"Error: Configuration error for provider '{settings.WEBHOOK_TUNNEL}'. {e}", file=sys.stderr)
            sys.exit(1)
    
    # 3. Create the service and inject dependencies
    service = WebhookService(app, port=PORT, tunnel_provider=tunnel_provider)
    
    # 4. Run it
    await service.run()

if __name__ == "__main__":
    # Note: Arg parsing and settings loading is already done at the top.
    asyncio.run(main())

