from drf_spectacular.utils import OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes
from tables.swagger_schemas.common_schemas import UNAUTHORIZED_401_RESPONSE

REGISTER_WEBHOOKS_POST = dict(
    summary="Register webhooks",
    description="Triggers registration of all webhooks via the webhook trigger service.",
    responses={
        200: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="OK",
            examples=[
                OpenApiExample(
                    "Webhooks registered",
                    value={},
                    response_only=True,
                ),
            ],
        ),
        400: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Bad Request - Failed to register webhooks.",
            examples=[
                OpenApiExample(
                    "Registration error",
                    value={"error": "Failed to register webhooks."},
                    response_only=True,
                ),
            ],
        ),
        401: UNAUTHORIZED_401_RESPONSE,
    },
)
