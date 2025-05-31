from enum import Enum
from pydantic import BaseModel


class RunCrewModel(BaseModel):
    crew_id: int


class SessionStatus(Enum):
        END = "end"
        RUN = "run"
        WAIT_FOR_USER = "wait_for_user"
        ERROR = "error"
