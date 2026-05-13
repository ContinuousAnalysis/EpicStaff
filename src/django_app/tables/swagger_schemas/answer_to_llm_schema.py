from drf_spectacular.utils import OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes
from tables.serializers.serializers import AnswerToLLMSerializer

ANSWER_TO_LLM = dict(
    summary="Submit user answer to a waiting LLM session",
    description="Sends the user's text response to an active session that is paused and waiting for human input (status = `wait_for_user`). The answer is registered as a session message and forwarded via Redis to the appropriate crew node.",
    request=AnswerToLLMSerializer,
    responses={
        400: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Validation error — one or more request fields are missing or invalid.",
            examples=[
                OpenApiExample(
                    "Validation error",
                    value={
                        "session_id": ["This field is required."],
                        "answer": ["This field may not be blank."],
                    },
                    response_only=True,
                ),
            ],
        ),
        404: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="No session exists for the given `session_id`.",
            examples=[
                OpenApiExample(
                    "Session not found",
                    value="Session not found",
                    response_only=True,
                ),
            ],
        ),
        418: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="The session exists but is not currently waiting for user input (status != `wait_for_user`).",
            examples=[
                OpenApiExample(
                    "Wrong session status",
                    value="Session status is not wait_for_user",
                    response_only=True,
                ),
            ],
        ),
    },
)
