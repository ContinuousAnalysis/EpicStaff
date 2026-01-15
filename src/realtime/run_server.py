from math import log
import os
import uvicorn
import sys
from dotenv import load_dotenv, find_dotenv
from loguru import logger
if "--debug" in sys.argv:
    logger.info("RUNNING IN DEBUG MODE")

    load_dotenv(find_dotenv("debug.env"))
else:
    load_dotenv(find_dotenv(".env"))

PORT = os.environ.get("REALTIME_PORT", 8050)

def main():
    """Run the FastAPI server with uvicorn."""
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=PORT,
        reload=False,
        reload_dirs=["src"],
        workers=1,
        log_level="debug",
    )


if __name__ == "__main__":
    main()
