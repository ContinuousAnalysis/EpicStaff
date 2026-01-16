import uvicorn
from loguru import logger
from .core.config import settings


def main():
    if settings.DEBUG_MODE:
        logger.info("RUNNING IN DEBUG MODE")

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.RELOAD,
        reload_dirs=["src"] if settings.RELOAD else None,
        workers=settings.WORKERS,
        log_level="debug" if settings.DEBUG_MODE else "info",
    )


if __name__ == "__main__":
    main()
