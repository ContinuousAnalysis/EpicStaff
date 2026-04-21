import json

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from loguru import logger

from tables.constants.schedule_constants import (
    CRON_EVERY_N_MINUTES,
    CRON_EVERY_N_HOURS,
    CRON_EVERY_N_DAYS,
    CRON_WEEKDAYS,
    CRON_WEEKLY_SUNDAY,
    CRON_EVERY_N_MONTHS,
)
from tables.models.graph_models import ScheduleTriggerNode
from utils.singleton_meta import SingletonMeta
from utils.graph_utils import generate_node_name
from tables.services.redis_service import RedisService
from tables.services.session_manager_service import SessionManagerService


def generate_cron(node: ScheduleTriggerNode) -> str | None:
    """
    Generates a 5-field CRON expression for modes supported by crontab.
    NOTE: seconds are not supported by crontab and must be scheduled via IntervalTrigger.
    For once mode, DateTrigger is recommended.
    """
    if node.run_mode == ScheduleTriggerNode.RunMode.ONCE:
        return None

    if node.run_mode != ScheduleTriggerNode.RunMode.REPEAT:
        return None

    unit = node.unit
    every = node.every

    if unit == ScheduleTriggerNode.TimeUnit.MINUTES:
        return CRON_EVERY_N_MINUTES.format(every=every)
    elif unit == ScheduleTriggerNode.TimeUnit.HOURS:
        return CRON_EVERY_N_HOURS.format(every=every)
    elif unit == ScheduleTriggerNode.TimeUnit.DAYS:
        if node.weekdays:
            return CRON_WEEKDAYS.format(weekdays=','.join(node.weekdays))
        return CRON_EVERY_N_DAYS.format(every=every)
    elif unit == ScheduleTriggerNode.TimeUnit.WEEKS:
        if node.weekdays:
            return CRON_WEEKDAYS.format(weekdays=','.join(node.weekdays))
        return CRON_WEEKLY_SUNDAY
    elif unit == ScheduleTriggerNode.TimeUnit.MONTHS:
        return CRON_EVERY_N_MONTHS.format(every=every)
    elif unit == ScheduleTriggerNode.TimeUnit.SECONDS:
        return None

    return None


class ScheduleTriggerService(metaclass=SingletonMeta):
    """
    Service for running graph sessions on schedule.

    Pattern: SingletonMeta (same as WebhookTriggerService, TelegramTriggerService).
    Dependency injection: SessionManagerService is passed via __init__
    to allow mock substitution in tests.
    """

    def __init__(self, session_manager_service=None):
        if session_manager_service is None:
            session_manager_service = SessionManagerService()
        self.session_manager_service = session_manager_service

    @transaction.atomic
    def handle_schedule_trigger(self, node_id: int) -> None:
        """
        Runs a graph session if all schedule conditions are met.

        Input:
            node_id — PK of the ScheduleTriggerNode that fired

        Process (inside transaction):
            1. SELECT ... FOR UPDATE SKIP LOCKED
               → if row is locked → exit (another worker is handling it)
            2. Guard: start_date_time > now → exit (too early)
            3. Guard: end_type='on_date' and end_date_time <= now → exit (expired)
            4. Guard: end_type='after_n_runs' and current_runs >= max_runs → exit (limit reached)
            5. session_manager_service.run_session(graph_id, variables, entrypoint)
            6. Atomic UPDATE current_runs = current_runs + 1 via F()

        Output:
            - On success: new Session created, current_runs incremented by 1
            - On guard-fail: early return without error
            - On exception: raise after logger.error (transaction rolls back)
        """
        try:
            now = timezone.now()

            node = (
                ScheduleTriggerNode.objects
                .select_for_update(skip_locked=True)
                .filter(id=node_id, is_active=True)
                .first()
            )
            if node is None:
                logger.warning(
                    f"[ScheduleTriggerService] Node {node_id} not found, "
                    f"inactive, or locked by another worker. Skipping."
                )
                return

            if node.start_date_time and node.start_date_time > now:
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"start time {node.start_date_time} not yet reached (now={now})."
                )
                return

            if (
                node.end_type == "on_date"
                and node.end_date_time
                and node.end_date_time <= now
            ):
                RedisService().redis_client.publish(
                    "schedule_channel",
                    json.dumps({"action": "deactivate", "node_id": node.pk}),
                )
                logger.info(
                    f"[ScheduleTriggerService] Node {node_id}: "
                    f"end date {node.end_date_time} has passed, "
                    f"published 'deactivate' signal."
                )
                return

            if (
                node.end_type == "after_n_runs"
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
                node.end_type == "after_n_runs"
                and node.max_runs is not None
                and node.current_runs >= node.max_runs
            ):
                RedisService().redis_client.publish(
                    "schedule_channel",
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
