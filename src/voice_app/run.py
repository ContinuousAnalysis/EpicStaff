import uvicorn
import sys
from pyngrok import ngrok
from loguru import logger
from app.core.config import settings

def start_tunnel():
    """Запуск ngrok и автоматическое обновление настроек"""
    try:
        # Открываем туннель на порт, указанный в настройках
        public_url = ngrok.connect(settings.PORT).public_url
        logger.info(f"Ngrok tunnel established: {public_url}")
        
    except Exception as e:
        logger.error(f"Failed to start ngrok: {e}")

def main():
    # Запускаем туннель только если мы не в режиме reload (или один раз)
    if not any(arg in sys.argv for arg in ["--reload", "reload"]):
        start_tunnel()
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        log_level="info"
    )

if __name__ == "__main__":
    main()