import json

from tables.models.session_models import Session
from tables.import_export.strategies.base import EntityImportExportStrategy
from tables.import_export.serializers.session import GraphSessionMessageExportSerializer
from tables.import_export.enums import EntityType
from tables.import_export.id_mapper import IDMapper


class SessionStrategy(EntityImportExportStrategy):
    entity_type = EntityType.SESSION

    CSV_FIELDS = [
        "id",
        "session_id",
        "created_at",
        "name",
        "execution_order",
        "message_type",
        "message_data",
    ]

    @staticmethod
    def csv_row_mapper(m: dict) -> dict:
        return {
            "id": m["id"],
            "session_id": m["session_id"],
            "created_at": m["created_at"],
            "name": m["name"],
            "execution_order": m["execution_order"],
            "message_type": (m.get("message_data") or {}).get("message_type", ""),
            "message_data": json.dumps(m.get("message_data")),
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
