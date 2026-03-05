import time
import requests
from loguru import logger
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_none,
)

from django_app.settings import (
    REDIS_TUNNEL_CONFIG_CHANNEL,
    WEBHOOK_HOST_NAME,
    WEBHOOK_PORT,
)
from tables.models.graph_models import GraphOrganization, WebhookTriggerNode
from tables.models.webhook_models import NgrokWebhookConfig, WebhookTrigger
from tables.request_models import WebhookConfigData
from tables.services.converter_service import ConverterService
from tables.services.redis_service import RedisService
from tables.services.session_manager_service import SessionManagerService
from utils.singleton_meta import SingletonMeta


class WebhookTriggerService(metaclass=SingletonMeta):
    _tunnel_url_cache: dict[str, tuple[str, float]] = {}
    _TUNNEL_URL_TTL = 30.0

    def __init__(
        self,
        session_manager_service: SessionManagerService,
        redis_service: RedisService,
        converter_service: ConverterService,
    ):
        self.converter_service = converter_service
        self.redis_service = redis_service
        self.session_manager_service = session_manager_service

    def get_trigger_filters(self, path: str, config_id: str | None = None) -> dict:
        filters = {"webhook_trigger__path": path}

        if config_id:
            if ":" in config_id:
                provider, config_name = config_id.split(":", 1)
            else:
                provider, config_name = "ngrok", config_id

            if provider == "ngrok":
                filters["webhook_trigger__ngrok_webhook_config__name"] = config_name
            else:
                logger.warning(
                    f"Unknown tunnel provider '{provider}' for config '{config_name}'"
                )

        return filters

    def handle_webhook_trigger(
        self, path: str, payload: dict, config_id: str | None = None
    ) -> None:
        filters = self.get_trigger_filters(path, config_id)

        webhook_trigger_node_list = WebhookTriggerNode.objects.filter(**filters)

        for webhook_trigger_node in webhook_trigger_node_list:
            graph_organization = GraphOrganization.objects.filter(
                graph=webhook_trigger_node.graph
            ).first()
            variables: dict = {"trigger_payload": payload}
            if graph_organization:
                variables.update(graph_organization.persistent_variables)

            self.session_manager_service.run_session(
                graph_id=webhook_trigger_node.graph.pk,
                variables=variables,
                entrypoint=webhook_trigger_node.node_name,
            )

    def register_webhooks(self) -> bool:
        data = WebhookConfigData(
            ngrok_configs=[
                self.converter_service.convert_ngrok_webhook_config_to_pydantic(config)
                for config in NgrokWebhookConfig.objects.all()
            ]
        )

        redis_client = self.redis_service.redis_client
        delivered_n = redis_client.publish(
            channel=REDIS_TUNNEL_CONFIG_CHANNEL, message=data.model_dump_json()
        )
        self._tunnel_url_cache.clear()
        return delivered_n > 0

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_none(),
        retry=retry_if_exception_type((requests.RequestException, ValueError)),
        reraise=True,
    )
    def get_tunnel_url(self, ngrok_webhook_config: NgrokWebhookConfig) -> str:
        """Fetch the tunnel URL from the local service with retries."""

        unique_id = f"ngrok:{ngrok_webhook_config.name}"

        cached = self._tunnel_url_cache.get(unique_id)
        if cached:
            url, expires_at = cached
            if time.monotonic() < expires_at:
                return url
            del self._tunnel_url_cache[unique_id]

        response = requests.get(
            f"http://{WEBHOOK_HOST_NAME}:{WEBHOOK_PORT}/api/tunnel-url/{unique_id}",
            timeout=2,
        )
        response.raise_for_status()
        url = response.json().get("tunnel_url")
        if not url:
            raise ValueError("Tunnel service returned an empty URL")

        self._tunnel_url_cache[unique_id] = (
            url,
            time.monotonic() + self._TUNNEL_URL_TTL,
        )
        return url
