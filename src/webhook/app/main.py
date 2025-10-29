from fastapi import FastAPI
from app.controllers import webhook_routes
from app.services.redis_service import close_redis_connection

def create_app() -> FastAPI:
    """
    Factory function to create and configure the FastAPI app.
    """
    app = FastAPI(title="WebhookService")

    # Register the controllers/routes
    app.include_router(webhook_routes.router)

    # Add a shutdown event handler to cleanly close Redis
    @app.on_event("shutdown")
    async def shutdown_event():
        print("Application shutting down...")
        await close_redis_connection()

    return app