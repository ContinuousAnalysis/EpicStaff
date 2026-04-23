import json

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from loguru import logger

from django_app.settings import SCHEDULE_CHANNEL
from tables.models.graph_models import ScheduleTriggerNode
from utils.singleton_meta import SingletonMeta
from utils.graph_utils import generate_node_name
from tables.services.redis_service import RedisService
from tables.services.session_manager_service import SessionManagerService


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
                RedisService().redis_client.publish(
                    SCHEDULE_CHANNEL,
                    json.dumps({"action": "deactivate", "node_id": node.pk}),
                )
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"end date {node.end_date_time} has passed, "
                    f"published 'deactivate' signal."
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
                RedisService().redis_client.publish(
                    SCHEDULE_CHANNEL,
                    json.dumps({"action": "deactivate", "node_id": node.pk}),
                )
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"max runs reached ({node.current_runs}/{node.max_runs}), "
                    f"published 'deactivate' signal."
                )

        except Exception as exc:
            logger.error(
                f"[ScheduleTriggerService] Error processing node {node_id}: {exc}"
            )
            raise
