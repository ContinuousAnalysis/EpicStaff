from drf_spectacular.utils import OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes
from tables.swagger_schemas.common_schemas import UNAUTHORIZED_401_RESPONSE

TELEGRAM_TRIGGER_AVAILABLE_FIELDS_GET = dict(
    summary="Get available fields for TelegramTriggerNode",
    description="Returns all possible fields that can be created for a TelegramTriggerNode.",
    responses={
        200: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="List of available fields returned successfully.",
            examples=[
                OpenApiExample(
                    "Available fields",
                    value={"data": ["field_1", "field_2", "field_3"]},
                    response_only=True,
                ),
            ],
        ),
        401: UNAUTHORIZED_401_RESPONSE,
    },
)

REGISTER_TELEGRAM_TRIGGER_POST = dict(
    summary="Register a Telegram trigger",
    description="Registers a Telegram trigger for the given TelegramTriggerNode by its ID.",
    responses={
        200: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="OK",
            examples=[
                OpenApiExample(
                    "Telegram trigger registered",
                    value={},
                    response_only=True,
                ),
            ],
        ),
        400: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Bad Request - Invalid Input",
            examples=[
                OpenApiExample(
                    "Validation error",
                    value={"telegram_trigger_node_id": ["This field is required."]},
                    response_only=True,
                ),
            ],
        ),
        401: UNAUTHORIZED_401_RESPONSE,
        404: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="TelegramTriggerNode not found",
            examples=[
                OpenApiExample(
                    "Node not found",
                    value={"error": "TelegramTriggerNode not found"},
                    response_only=True,
                ),
            ],
        ),
        503: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="No webhook tunnel available",
            examples=[
                OpenApiExample(
                    "No tunnel available",
                    value={"error": "No webhook tunnel available"},
                    response_only=True,
                ),
            ],
        ),
    },
)
