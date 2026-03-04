import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from loguru import logger

from app.core.config import get_settings
from app.services.bot_registry import BotRegistry
from app.services.django_api_service import DjangoApiService
from app.services.matrix_client import MatrixClient
from app.services.redis_service import RedisService
from app.controllers.bridge_routes import router


async def _sync_bot_rooms(
    bot_user_id: str,
    matrix_client: MatrixClient,
    room_bot_map: dict,
    direct_rooms: set,
) -> None:
    """Populate room_bot_map; accept pending invites; restore DM room tracking."""
    joined = await matrix_client.get_joined_rooms(bot_user_id)
    for room_id in joined:
        room_bot_map[room_id] = bot_user_id

    bot_direct = await matrix_client.get_direct_rooms(bot_user_id)
    direct_rooms.update(bot_direct)

    pending = await matrix_client.get_pending_invites(bot_user_id)
    for room_id in pending:
        await matrix_client.join_room(user_id=bot_user_id, room_id=room_id)
        room_bot_map[room_id] = bot_user_id
        logger.info(f"Bot {bot_user_id} accepted pending invite to {room_id}")


async def _bots_update_callback(
    event: str,
    bot_id: int,
    bot_registry: BotRegistry,
    django_service: DjangoApiService,
    matrix_client: MatrixClient,
    room_bot_map: dict,
    direct_rooms: set,
) -> None:
    """Called when a MatrixBot is created/updated/deleted via Redis."""
    if event == "deleted":
        for bot in bot_registry.get_all():
            if True:
                pass
        logger.info(f"Bot {bot_id} deleted event received")
        return

    bot = await django_service.get_bot_by_id(bot_id)
    if bot is None:
        logger.warning(f"Bot {bot_id} not found after {event} event")
        return

    if event in ("created", "updated"):
        if bot.enabled:
            bot_registry.set(bot)
            await matrix_client.ensure_user_exists(bot.matrix_user_id)
            await _sync_bot_rooms(bot.matrix_user_id, matrix_client, room_bot_map, direct_rooms)
            logger.info(f"Bot {bot.matrix_user_id} registered after {event} event")
        else:
            bot_registry.remove(bot.matrix_user_id)
            logger.info(f"Bot {bot.matrix_user_id} disabled after {event} event")


async def _periodic_bot_sync(
    django_service: DjangoApiService,
    bot_registry: BotRegistry,
    matrix_client: MatrixClient,
    room_bot_map: dict,
    direct_rooms: set,
    interval: int = 60,
) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            bots = await django_service.get_enabled_bots()
            for bot in bots:
                bot_registry.set(bot)
                await matrix_client.ensure_user_exists(bot.matrix_user_id)
                await _sync_bot_rooms(bot.matrix_user_id, matrix_client, room_bot_map, direct_rooms)
            logger.debug(f"Periodic sync: refreshed {len(bots)} bot(s)")
        except Exception:
            logger.exception("Periodic bot sync failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    bot_registry = BotRegistry()
    django_service = DjangoApiService()
    matrix_client = MatrixClient()
    redis_service = RedisService()
    room_bot_map: dict[str, str] = {}
    direct_rooms: set[str] = set()

    app.state.settings = settings
    app.state.bot_registry = bot_registry
    app.state.django_service = django_service
    app.state.matrix_client = matrix_client
    app.state.redis_service = redis_service
    app.state.room_bot_map = room_bot_map
    app.state.direct_rooms = direct_rooms

    logger.info("Loading enabled bots from Django API...")
    try:
        bots = await django_service.get_enabled_bots()
        for bot in bots:
            bot_registry.set(bot)
            await matrix_client.ensure_user_exists(bot.matrix_user_id)
            await _sync_bot_rooms(bot.matrix_user_id, matrix_client, room_bot_map, direct_rooms)
        logger.info(f"Loaded {len(bots)} bot(s)")
    except Exception:
        logger.exception("Failed to load bots from Django (will retry on bot events)")

    async def bots_callback(event: str, bot_id: int) -> None:
        await _bots_update_callback(
            event, bot_id, bot_registry, django_service, matrix_client, room_bot_map, direct_rooms
        )

    task_status = asyncio.create_task(redis_service.run_session_status_listener())
    task_bots = asyncio.create_task(redis_service.subscribe_bots_update(bots_callback))
    task_sync = asyncio.create_task(
        _periodic_bot_sync(django_service, bot_registry, matrix_client, room_bot_map, direct_rooms)
    )

    logger.info("Matrix bridge started successfully")
    yield

    task_status.cancel()
    task_bots.cancel()
    task_sync.cancel()
    try:
        await task_status
    except asyncio.CancelledError:
        pass
    try:
        await task_bots
    except asyncio.CancelledError:
        pass
    try:
        await task_sync
    except asyncio.CancelledError:
        pass


def create_app() -> FastAPI:
    app = FastAPI(title="EpicStaff Matrix Bridge", lifespan=lifespan)
    app.include_router(router)
    return app
