from drf_yasg import openapi

_detail_field = openapi.Schema(
    type=openapi.TYPE_STRING,
    description="Human-readable status message.",
)

_input_field = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    nullable=True,
    description=(
        "The input dict from the last successful test run, "
        "or null when no matching data is found."
    ),
)

LAST_TEST_INPUT_SWAGGER = dict(
    operation_summary="Get Last Test Input for Python Node",
    responses={
        200: openapi.Response(
            description="Result of the lookup — always 200, check 'input' for data.",
            schema=openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    "detail": _detail_field,
                    "input": _input_field,
                },
            ),
        ),
        404: "PythonNode not found",
    },
)
