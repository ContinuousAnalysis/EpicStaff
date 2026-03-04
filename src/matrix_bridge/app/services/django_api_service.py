import httpx
from loguru import logger
from app.core.config import get_settings
from app.models.matrix_models import BotConfig


class DjangoApiService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._base_url = self._settings.django_api_url

    async def get_enabled_bots(self) -> list[BotConfig]:
        """Fetch all enabled matrix bots from Django API."""
        url = f"{self._base_url}/matrix-bots/?enabled=true"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            bots = []
            for item in results:
                bots.append(
                    BotConfig(
                        flow_id=item["flow"],
                        matrix_user_id=item["matrix_user_id"],
                        input_variable=item.get("input_variable", "message"),
                        output_variable=item.get("output_variable", "context"),
                        enabled=item.get("enabled", True),
                    )
                )
            return bots

    async def get_bot_by_id(self, bot_id: int) -> BotConfig | None:
        """Fetch a single matrix bot by ID."""
        url = f"{self._base_url}/matrix-bots/{bot_id}/"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(url)
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                item = response.json()
                return BotConfig(
                    flow_id=item["flow"],
                    matrix_user_id=item["matrix_user_id"],
                    input_variable=item.get("input_variable", "message"),
                    output_variable=item.get("output_variable", "context"),
                    enabled=item.get("enabled", True),
                )
            except httpx.HTTPError:
                logger.exception(f"Failed to fetch bot {bot_id}")
                return None

    async def run_session(self, graph_id: int, variables: dict) -> int:
        """Start a new flow session. Returns session_id."""
        url = f"{self._base_url}/run-session/"
        payload = {"graph_id": graph_id, "variables": variables}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()["session_id"]

    async def get_session(self, session_id: int) -> dict:
        """Retrieve session data including output variables."""
        url = f"{self._base_url}/sessions/{session_id}/"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
