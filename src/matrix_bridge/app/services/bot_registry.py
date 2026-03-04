from loguru import logger
from app.models.matrix_models import BotConfig


class BotRegistry:
    """In-memory registry mapping matrix_user_id -> BotConfig."""

    def __init__(self) -> None:
        self._bots: dict[str, BotConfig] = {}

    def get(self, matrix_user_id: str) -> BotConfig | None:
        return self._bots.get(matrix_user_id)

    def get_all(self) -> list[BotConfig]:
        return list(self._bots.values())

    def set(self, bot: BotConfig) -> None:
        self._bots[bot.matrix_user_id] = bot
        logger.debug(f"Registered bot {bot.matrix_user_id} (flow_id={bot.flow_id})")

    def remove(self, matrix_user_id: str) -> None:
        if matrix_user_id in self._bots:
            del self._bots[matrix_user_id]
            logger.debug(f"Removed bot {matrix_user_id}")

    def is_known_user(self, user_id: str) -> bool:
        return user_id in self._bots
