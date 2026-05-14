import json

from tables.models.session_models import Session
from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.session import GraphSessionMessageExportSerializer
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper


class SessionStrategy(EntityImportExportStrategy):
    entity_type = EntityType.SESSION

    # TODO: if new node types are added we should update this (at least list for now).
    # consider moving message data dataclasses from crew/models/graph_models.py to src/shared/models/
    # so that CSV_FIELDS and csv_row_mapper can be auto-generated via dataclasses.fields()
    CSV_FIELDS = [
        "id",
        "session_id",
        "created_at",
        "name",
        "execution_order",
        "msg__type",
        "msg__crew_id",
        "msg__agent_id",
        "msg__task_id",
        "msg__text",
        "msg__thought",
        "msg__tool",
        "msg__tool_input",
        "msg__result",
        "msg__task_raw",
        "msg__error",
        "msg__task_description",
        "msg__task_expected_output",
        "msg__task_agent_name",
        "msg__llm_response",
        "msg__prompt_text",
        "msg__raw_response",
        "msg__parsed_result",
        "msg__group_name",
        "msg__condition_result",
        "msg__expression",
        "msg__input_json",
        "msg__output_json",
    ]

    @staticmethod
    def csv_row_mapper(m: dict) -> dict:
        d = m.get("message_data") or {}
        mtype = d.get("message_type", "")

        def _json(val):
            return json.dumps(val) if val is not None else None

        return {
            "id": m["id"],
            "session_id": m["session_id"],
            "created_at": m["created_at"],
            "name": m["name"],
            "execution_order": m["execution_order"],
            "msg__type": mtype,
            "msg__crew_id": d.get("crew_id"),
            "msg__agent_id": d.get("agent_id"),
            "msg__task_id": d.get("task_id"),
            "msg__text": d.get("text"),
            "msg__thought": d.get("thought"),
            "msg__tool": d.get("tool"),
            "msg__tool_input": d.get("tool_input"),
            "msg__result": d.get("result")
            if mtype in ("agent", "agent_finish")
            else None,
            "msg__task_raw": d.get("raw") if mtype == "task" else None,
            "msg__error": d.get("details") or d.get("error"),
            "msg__task_description": d.get("description"),
            "msg__task_expected_output": d.get("expected_output"),
            "msg__task_agent_name": d.get("agent") if mtype == "task" else None,
            "msg__llm_response": d.get("response"),
            "msg__prompt_text": d.get("prompt_text"),
            "msg__raw_response": d.get("raw_response"),
            "msg__parsed_result": _json(d.get("parsed_result")),
            "msg__group_name": d.get("group_name"),
            "msg__condition_result": str(d.get("result"))
            if mtype in ("condition_group", "condition_group_manipulation")
            else None,
            "msg__expression": d.get("expression"),
            "msg__input_json": _json(d.get("input")),
            "msg__output_json": _json(d.get("output")),
        }

    def get_instance(self, entity_id: int) -> Session:
        return Session.objects.filter(id=entity_id).first()

    def get_preview_data(self, instance: Session) -> dict:
        return {"id": instance.id, "status": instance.status}

    def extract_dependencies_from_instance(self, instance: Session) -> dict:
        sub_ids = list(instance.subgraph_sessions.values_list("id", flat=True))
        return {EntityType.SESSION: sub_ids}

    def export_entity(self, instance: Session) -> list:
        return list(
            GraphSessionMessageExportSerializer(
                instance.graphsessionmessage_set.all().order_by("created_at"),
                many=True,
            ).data
        )

    def create_entity(self, data: dict, id_mapper: IDMapper, **kwargs):  # noqa: ARG002
        raise NotImplementedError("Session export is read-only")
