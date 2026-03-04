import uvicorn
from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:create_app",
        host="0.0.0.0",
        port=settings.matrix_bridge_port,
        factory=True,
        log_level="info",
    )
