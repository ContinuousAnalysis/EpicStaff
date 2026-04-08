from drf_spectacular.utils import OpenApiResponse, inline_serializer
from rest_framework import serializers as drf_serializers

_node_item = inline_serializer(
    name="NodeItem",
    fields={},
)

_edge_item = inline_serializer(
    name="EdgeItem",
    fields={},
)

_conditional_edge_item = inline_serializer(
    name="ConditionalEdgeItem",
    fields={},
)

SAVE_FLOW_SWAGGER = dict(
    summary="Bulk save all flow nodes and edges",
    description=(
        "Atomically upserts and deletes all nodes/edges for a flow in one request.\n\n"
        "- Entity with `id` → update.\n"
        "- Entity without `id` → create.\n"
        "- IDs in `deleted` → deleted (validated as belonging to this graph).\n\n"
        "FE sends only changed entities. "
        "All entities are validated first. If any fail, the entire request is rejected "
        "and no DB writes happen."
    ),
    request=inline_serializer(
        name="SaveFlowRequest",
        fields={
            "crew_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "python_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "file_extractor_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "audio_transcription_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "llm_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "start_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "end_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "subgraph_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "decision_table_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "graph_note_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "webhook_trigger_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "telegram_trigger_node_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "edge_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "conditional_edge_list": drf_serializers.ListField(child=drf_serializers.DictField(), required=False),
            "deleted": drf_serializers.DictField(required=False),
        },
    ),
    responses={
        200: OpenApiResponse(description="Full updated graph state after save."),
        400: OpenApiResponse(description="Validation errors — no DB changes were made."),
        404: OpenApiResponse(description="Graph not found."),
    },
)
