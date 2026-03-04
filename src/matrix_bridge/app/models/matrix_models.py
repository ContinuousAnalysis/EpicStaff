from typing import Any
from pydantic import BaseModel


class MatrixEvent(BaseModel):
    type: str
    room_id: str | None = None
    sender: str | None = None
    content: dict[str, Any] = {}
    event_id: str | None = None
    origin_server_ts: int | None = None
    state_key: str | None = None


class MatrixTransaction(BaseModel):
    events: list[MatrixEvent]


class BotConfig(BaseModel):
    flow_id: int
    matrix_user_id: str
    input_variable: str = "message"
    output_variable: str = "context"
    enabled: bool = True
