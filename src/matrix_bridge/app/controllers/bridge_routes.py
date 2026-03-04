import asyncio
from fastapi import APIRouter, Request, HTTPException, Header
from loguru import logger

from app.models.matrix_models import MatrixTransaction

router = APIRouter()


def _verify_hs_token(authorization: str | None, expected_token: str) -> None:
    if not authorization or authorization != f"Bearer {expected_token}":
        raise HTTPException(status_code=403, detail="Forbidden: invalid hs_token")


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.put("/_matrix/app/v1/transactions/{txn_id}")
async def receive_transaction(
    txn_id: str,
    transaction: MatrixTransaction,
    request: Request,
    authorization: str | None = Header(default=None),
):
    settings = request.app.state.settings
    _verify_hs_token(authorization, settings.matrix_hs_token)

    bot_registry = request.app.state.bot_registry
    room_bot_map: dict[str, str] = request.app.state.room_bot_map
    matrix_client = request.app.state.matrix_client
    django_service = request.app.state.django_service
    redis_service = request.app.state.redis_service
    direct_rooms: set[str] = request.app.state.direct_rooms

    for event in transaction.events:
        try:
            event_type = event.type
            room_id = event.room_id

            if event_type == "m.room.member":
                membership = event.content.get("membership")
                state_key = event.state_key  # the user being invited
                sender = event.sender
                if membership == "invite" and state_key and bot_registry.is_known_user(state_key):
                    logger.info(f"Bot {state_key} invited to {room_id}, joining...")
                    await matrix_client.join_room(user_id=state_key, room_id=room_id)
                    room_bot_map[room_id] = state_key
                    if event.content.get("is_direct"):
                        direct_rooms.add(room_id)
                        await matrix_client.mark_room_as_direct(
                            user_id=state_key, inviter_id=sender, room_id=room_id
                        )

            elif event_type == "m.room.message":
                sender = event.sender
                msg_type = event.content.get("msgtype")
                bot_user_id = room_bot_map.get(room_id)

                if not bot_user_id:
                    continue
                if sender == bot_user_id:
                    continue  # avoid self-loop
                if msg_type != "m.text":
                    continue

                is_direct_room = room_id in direct_rooms
                mentioned_users = event.content.get("m.mentions", {}).get("user_ids", [])
                is_mentioned = bot_user_id in mentioned_users
                if not is_mentioned:
                    localpart = bot_user_id.split(":")[0].lstrip("@")
                    is_mentioned = localpart in event.content.get("body", "")
                if not is_direct_room and not is_mentioned:
                    continue

                message_text = event.content.get("body", "")
                bot_config = bot_registry.get(bot_user_id)
                if not bot_config:
                    continue

                asyncio.create_task(
                    _handle_message(
                        message_text=message_text,
                        room_id=room_id,
                        bot_config=bot_config,
                        matrix_client=matrix_client,
                        django_service=django_service,
                        redis_service=redis_service,
                    )
                )
        except Exception:
            logger.exception(f"Error processing event {event.type} in {event.room_id}")

    return {}


async def _handle_message(
    message_text: str,
    room_id: str,
    bot_config,
    matrix_client,
    django_service,
    redis_service,
) -> None:
    try:
        variables = {bot_config.input_variable: message_text}
        session_id = await django_service.run_session(
            graph_id=bot_config.flow_id, variables=variables
        )
        logger.info(f"Started session {session_id} for flow {bot_config.flow_id}")
    except Exception:
        logger.exception(f"Failed to start session for room {room_id}")
        await matrix_client.send_message(
            user_id=bot_config.matrix_user_id,
            room_id=room_id,
            message="Sorry, I failed to start the flow. Please check the bridge logs.",
        )
        return

    try:
        status = await redis_service.subscribe_session_status(session_id, timeout=300.0)
        if status == "end":
            session_data = await django_service.get_session(session_id)
            variables_out = session_data.get("status_data", {}).get("variables", {})
            print(variables_out)
            reply = str(variables_out.get(bot_config.output_variable, "(no output)"))
        elif status == "error":
            reply = "An error occurred while processing your request."
        else:
            reply = "Request timed out. Please try again."
        await matrix_client.send_message(
            user_id=bot_config.matrix_user_id, room_id=room_id, message=reply
        )
    except Exception:
        logger.exception(f"Error after starting session {session_id} in room {room_id}")


@router.get("/_matrix/app/v1/users/{user_id:path}")
async def query_user(user_id: str, request: Request, authorization: str | None = Header(default=None)):
    settings = request.app.state.settings
    _verify_hs_token(authorization, settings.matrix_hs_token)
    bot_registry = request.app.state.bot_registry
    if bot_registry.is_known_user(user_id):
        return {}
    raise HTTPException(status_code=404, detail="User not found")


@router.get("/_matrix/app/v1/rooms/{alias:path}")
async def query_room(alias: str, request: Request, authorization: str | None = Header(default=None)):
    settings = request.app.state.settings
    _verify_hs_token(authorization, settings.matrix_hs_token)
    raise HTTPException(status_code=404, detail="Room not found")
