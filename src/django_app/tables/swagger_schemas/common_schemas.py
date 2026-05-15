from drf_spectacular.utils import OpenApiResponse, OpenApiExample
from drf_spectacular.types import OpenApiTypes

UNAUTHORIZED_401_RESPONSE = OpenApiResponse(
    response=OpenApiTypes.STR,
    description="Request is not authenticated — credentials are missing or invalid.",
    examples=[
        OpenApiExample(
            "Not authenticated",
            value={
                "status_code": 401,
                "code": "not_authenticated",
                "message": "NotAuthenticated: Authentication credentials were not provided.",
            },
            response_only=True,
            status_codes=["401"],
        ),
    ],
)
