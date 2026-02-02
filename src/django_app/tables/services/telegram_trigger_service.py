import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from django_app.settings import WEBHOOK_HOST_NAME, WEBHOOK_PORT
from tables.exceptions import RegisterTelegramTriggerError
from tables.models.graph_models import TelegramTriggerNode
from tables.services.session_manager_service import SessionManagerService
from utils.singleton_meta import SingletonMeta


class TelegramTriggerService(metaclass=SingletonMeta):

    def __init__(self, session_manager_service: SessionManagerService | None = None):
        self.session_manager_service = (
            session_manager_service or SessionManagerService()
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type(requests.RequestException),
        reraise=True
    )
    def _get_tunnel_url(self) -> str:
        """Fetch the tunnel URL from the local service with retries."""
        response = requests.get(
            f"http://{WEBHOOK_HOST_NAME}:{WEBHOOK_PORT}/api/tunnel-url", 
            timeout=5
        )
        response.raise_for_status()
        url = response.json().get("tunnel_url")
        if not url:
            raise ValueError("Tunnel service returned an empty URL")
        return url

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((requests.RequestException, ValueError)),
        reraise=True
    )
    def _call_telegram_api(self, method: str, api_key: str, endpoint: str, params: dict = None):
        """Handle Telegram API calls with retries."""
        url = f"https://api.telegram.org/bot{api_key}/{endpoint}"
        response = requests.request(method, url, params=params, timeout=10)
        
        response.raise_for_status()
        data = response.json()
        
        if not data.get("ok"):
            raise ValueError(f"Telegram API error: {data.get('description')}")
            
        return data

    def register_telegram_trigger(self, path: str, telegram_bot_api_key: str):
        try:
            webhook_tunnel_url = self._get_tunnel_url()
        except Exception as e:
            raise RegisterTelegramTriggerError(
                f"Failed to fetch tunnel URL after retries: {str(e)}", 
                status_code=503
            )

        telegram_webhook_url = f"{webhook_tunnel_url}/webhooks/telegram-trigger/{path}/"

        try:
            return self._call_telegram_api(
                method="POST",
                api_key=telegram_bot_api_key,
                endpoint="setWebhook",
                params={"url": telegram_webhook_url}
            )
        except Exception as e:
            raise RegisterTelegramTriggerError(
                f"Failed to register Telegram webhook after retries: {str(e)}"
            )

    def unregister_telegram_trigger(self, telegram_bot_api_key: str):
        try:
            return self._call_telegram_api(
                method="POST",
                api_key=telegram_bot_api_key,
                endpoint="deleteWebhook"
            )
        except Exception:
            return {"ok": False, "description": "Unregistration failed"}

    def handle_telegram_trigger(self, url_path: str, payload: dict) -> None:
        telegram_trigger_node_list = TelegramTriggerNode.objects.filter(
            url_path=url_path
        )

        for telegram_trigger_node in telegram_trigger_node_list:
            self.session_manager_service.run_session(
                graph_id=telegram_trigger_node.graph.pk,
                variables={"telegram_payload": payload},
                entrypoint=telegram_trigger_node.node_name,
            )

    def get_trigger_info(self, telegram_bot_api_key: str):
        try:
            return self._call_telegram_api(
                method="GET",
                api_key=telegram_bot_api_key,
                endpoint="getWebhookInfo"
            )
        except Exception:
            return None