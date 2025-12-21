from tables.services.session_manager_service import SessionManagerService
from tables.models.graph_models import TelegramTriggerNode
from tables.exceptions import RegisterTelegramTriggerError
from utils.singleton_meta import SingletonMeta
import requests
from django_app.settings import WEBHOOK_HOST_NAME


class TelegramTriggerService(metaclass=SingletonMeta):

    def __init__(self, session_manager_service: SessionManagerService | None = None):
        self.session_manager_service = (
            session_manager_service or SessionManagerService()
        )

    def register_telegram_trigger(self, path: str, telegram_bot_api_key: str):
        try:
            webhook_tunnel_url = (
                requests.get(f"http://{WEBHOOK_HOST_NAME}:8009/api/tunnel-url")
                .json()
                .get("tunnel_url")
            )
        except Exception as e:
            webhook_tunnel_url = None
        if webhook_tunnel_url is None:
            raise RegisterTelegramTriggerError("No webhook tunnel available")

        telegram_webhook_url = f"{webhook_tunnel_url}/webhooks/telegram-trigger/{path}/"
        try:
            response = requests.post(
                f"https://api.telegram.org/bot{telegram_bot_api_key}/setWebhook?url={telegram_webhook_url}"
            )
        except Exception as e:
            raise RegisterTelegramTriggerError(
                f"Failed to register Telegram webhook: {str(e)}"
            )
        if response.status_code != 200 or not response.json().get("ok", False):
            raise RegisterTelegramTriggerError(f"Telegram API error: {response.text}")
        return response.json()

    def unregister_telegram_trigger(self, telegram_bot_api_key: str):
        return requests.post(
            f"https://api.telegram.org/bot{telegram_bot_api_key}/deleteWebhook"
        )

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
        # Logic to retrieve information about a specific Telegram trigger
        pass
