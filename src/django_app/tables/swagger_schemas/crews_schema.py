from drf_spectacular.utils import (
    OpenApiResponse,
    OpenApiExample,
    OpenApiParameter,
)
from drf_spectacular.types import OpenApiTypes
from tables.swagger_schemas.common_schemas import UNAUTHORIZED_401_RESPONSE

CREW_DELETE = dict(
    summary="Delete a crew",
    description=(
        "Deletes the crew identified by `id`. "
        "If `delete_sessions=true`, all associated sessions are also deleted; "
        "otherwise they are detached (crew set to null). "
        "The operation runs in a single atomic transaction."
    ),
    parameters=[
        OpenApiParameter(
            name="delete_sessions",
            location=OpenApiParameter.QUERY,
            type=OpenApiTypes.STR,
            description="Delete all sessions associated (true/false). Default is false.",
            required=False,
        ),
    ],
    responses={
        200: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Crew deleted successfully.",
            examples=[
                OpenApiExample(
                    "Crew deleted",
                    value={"message": "Crew deleted successfully"},
                    response_only=True,
                    status_codes=["200"],
                ),
            ],
        ),
        400: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Invalid value for delete_sessions.",
            examples=[
                OpenApiExample(
                    "Invalid parameter",
                    value={
                        "error": "Invalid value for delete_sessions. Use 'true' or 'false'."
                    },
                    response_only=True,
                    status_codes=["400"],
                ),
            ],
        ),
        401: UNAUTHORIZED_401_RESPONSE,
        404: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Crew not found.",
            examples=[
                OpenApiExample(
                    "Crew not found",
                    value={"error": "Crew not found"},
                    response_only=True,
                    status_codes=["404"],
                ),
            ],
        ),
        500: OpenApiResponse(
            response=OpenApiTypes.STR,
            description="Unexpected error during deletion.",
            examples=[
                OpenApiExample(
                    "Internal server error",
                    value={"error": "An unexpected error occurred."},
                    response_only=True,
                    status_codes=["500"],
                ),
            ],
        ),
    },
)
