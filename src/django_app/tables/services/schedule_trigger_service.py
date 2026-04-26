import zoneinfo
from datetime import datetime, timezone as _datetime_timezone

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from loguru import logger

from tables.models.graph_models import ScheduleTriggerNode
from utils.singleton_meta import SingletonMeta
from utils.graph_utils import generate_node_name
from tables.services.session_manager_service import SessionManagerService


def parse_naive_to_utc(raw, tz_name: str | None) -> datetime | None:
    """Parse an ISO string in the given IANA tz into a UTC tz-aware datetime.

    Naive input is localized in `tz_name` (what the user typed on their wall
    clock). Aware input is respected as-is and converted to UTC. Returns None
    for empty input; raises ValueError on unparseable input or unknown tz.
    """
    if raw in (None, ""):
        return None
    if isinstance(raw, datetime):
        parsed = raw
    else:
        try:
            parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"Invalid ISO 8601 datetime: {raw!r}.") from exc

    if parsed.tzinfo is None:
        try:
            tz = zoneinfo.ZoneInfo(tz_name or "UTC")
        except zoneinfo.ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown IANA timezone: {tz_name!r}.") from exc
        parsed = parsed.replace(tzinfo=tz)

    return parsed.astimezone(_datetime_timezone.utc)


def format_utc_to_local_naive_iso(
    dt: datetime | None, tz_name: str | None
) -> str | None:
    """Render a UTC datetime as a naive ISO string in the given IANA tz.

    Falls back to UTC if `tz_name` is missing or unknown so a stored node is
    always renderable even if its tz later becomes invalid.
    """
    if dt is None:
        return None
    try:
        tz = zoneinfo.ZoneInfo(tz_name or "UTC")
    except zoneinfo.ZoneInfoNotFoundError:
        tz = zoneinfo.ZoneInfo("UTC")
    return dt.astimezone(tz).replace(tzinfo=None).isoformat()


class ScheduleTriggerService(metaclass=SingletonMeta):
    """Runs a graph session when a schedule fires (signalled from Manager via Redis)."""

    def __init__(self, session_manager_service: SessionManagerService):
        self.session_manager_service = session_manager_service

    @transaction.atomic
    def handle_schedule_trigger(self, node_id: int) -> None:
        """Check guards, start a graph session, and increment current_runs.

        select_for_update(skip_locked=True) lets concurrent workers race for the
        fired node; only one wins, others exit silently. current_runs is bumped
        via F() so concurrent increments never clobber each other.

        Terminal conditions (end_date reached, max_runs reached) flip
        is_active=False via .save() — the post_save signal publishes a
        node_update echo that Manager consumes to drop its APScheduler job. We
        intentionally do not publish 'deactivate' here to keep the channel's
        direction rule intact (Manager → Django only).
        """
        try:
            now = timezone.now()

            node = (
                ScheduleTriggerNode.objects.select_for_update(skip_locked=True)
                .filter(id=node_id, is_active=True)
                .first()
            )
            if node is None:
                logger.warning(
                    f"[ScheduleTriggerService] Node {node_id} not found, "
                    f"inactive, or locked by another worker. Skipping."
                )
                return

            if (
                node.end_type == ScheduleTriggerNode.EndType.ON_DATE
                and node.end_date_time
                and node.end_date_time <= now
            ):
                node.is_active = False
                node.save(update_fields=["is_active", "updated_at"])
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"end date {node.end_date_time} has passed, deactivated."
                )
                return

            if (
                node.end_type == ScheduleTriggerNode.EndType.AFTER_N_RUNS
                and node.max_runs is not None
                and node.current_runs >= node.max_runs
            ):
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"run limit reached ({node.current_runs}/{node.max_runs}). Skipping."
                )
                return

            self.session_manager_service.run_session(
                graph_id=node.graph_id,
                variables={},
                entrypoint=generate_node_name(node.id, node.node_name),
            )
            logger.info(
                f"[ScheduleTriggerService] Session started for node {node_id} "
                f"(graph_id={node.graph_id})."
            )

            ScheduleTriggerNode.objects.filter(pk=node.pk).update(
                current_runs=F("current_runs") + 1
            )

            node.refresh_from_db()
            if (
                node.end_type == ScheduleTriggerNode.EndType.AFTER_N_RUNS
                and node.max_runs is not None
                and node.current_runs >= node.max_runs
            ):
                node.is_active = False
                node.save(update_fields=["is_active", "updated_at"])
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"max runs reached ({node.current_runs}/{node.max_runs}), "
                    f"deactivated."
                )

        except Exception as exc:
            logger.error(
                f"[ScheduleTriggerService] Error processing node {node_id}: {exc}"
            )
            raise
