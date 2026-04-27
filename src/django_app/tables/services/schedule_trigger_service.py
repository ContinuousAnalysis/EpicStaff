from datetime import datetime
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from loguru import logger

from tables.models.graph_models import ScheduleTriggerNode
from tables.validators.schedule_trigger_validator import ScheduleTriggerValidator
from utils.singleton_meta import SingletonMeta
from utils.graph_utils import generate_node_name

if TYPE_CHECKING:
    from tables.services.session_manager_service import SessionManagerService


class ScheduleTriggerService(metaclass=SingletonMeta):
    """Runs a graph session when a schedule fires (signalled from Manager via Redis)."""

    def __init__(
        self,
        session_manager_service: "SessionManagerService",
        validator: ScheduleTriggerValidator | None = None,
    ):
        self.session_manager_service = session_manager_service
        self.validator = validator or ScheduleTriggerValidator()

    def create_node(self, validated_data: dict) -> ScheduleTriggerNode:
        return ScheduleTriggerNode.objects.create(**validated_data)

    def deactivate_node(self, node_id: int) -> None:
        """Flip is_active=False via .save() so post_save publishes node_update
        back to Manager — QuerySet.update() would skip the signal and leave
        Manager unaware via the standard update path.
        """
        node = ScheduleTriggerNode.objects.filter(id=node_id).first()
        if node is None:
            logger.warning(
                f"[ScheduleTriggerService] Node {node_id} not found for deactivation"
            )
            return
        if not node.is_active:
            logger.info(f"[ScheduleTriggerService] Node {node_id} already inactive")
            return
        node.is_active = False
        node.save(update_fields=["is_active", "updated_at"])
        logger.info(f"[ScheduleTriggerService] Node {node_id} deactivated")

    def update_node(
        self,
        instance: ScheduleTriggerNode,
        validated_data: dict,
    ) -> ScheduleTriggerNode:
        # Reactivating or changing the run cap restarts the run counter so the
        # node fires the full new quota instead of inheriting prior progress.
        reactivating = (
            not instance.is_active and validated_data.get("is_active") is True
        )
        new_max_runs = validated_data.get("max_runs", instance.max_runs)
        if reactivating or new_max_runs != instance.max_runs:
            validated_data["current_runs"] = 0

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance

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
            node = self._lock_active_node(node_id)
            if node is None:
                return
            if self._deactivate_if_end_date_passed(node, now):
                return
            if self._is_run_limit_reached(node):
                return

            self._start_session(node)
            self._increment_runs(node)
            self._deactivate_if_max_runs_reached(node)

        except Exception as exc:
            logger.error(
                f"[ScheduleTriggerService] Error processing node {node_id}: {exc}"
            )
            raise

    def _lock_active_node(self, node_id: int) -> ScheduleTriggerNode | None:
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
        return node

    def _deactivate_if_end_date_passed(
        self, node: ScheduleTriggerNode, now: datetime
    ) -> bool:
        if not (
            node.end_type == ScheduleTriggerNode.EndType.ON_DATE
            and node.end_date_time
            and node.end_date_time <= now
        ):
            return False

        node.is_active = False
        node.save(update_fields=["is_active", "updated_at"])
        logger.info(
            f"[ScheduleTriggerService] Node {node.id}: "
            f"end date {node.end_date_time} has passed, deactivated."
        )
        return True

    def _is_run_limit_reached(self, node: ScheduleTriggerNode) -> bool:
        if not self._max_runs_reached(node):
            return False
        logger.info(
            f"[ScheduleTriggerService] Node {node.id}: "
            f"run limit reached ({node.current_runs}/{node.max_runs}). Skipping."
        )
        return True

    def _start_session(self, node: ScheduleTriggerNode) -> None:
        self.session_manager_service.run_session(
            graph_id=node.graph_id,
            variables={},
            entrypoint=generate_node_name(node.id, node.node_name),
        )
        logger.info(
            f"[ScheduleTriggerService] Session started for node {node.id} "
            f"(graph_id={node.graph_id})."
        )

    def _increment_runs(self, node: ScheduleTriggerNode) -> None:
        ScheduleTriggerNode.objects.filter(pk=node.pk).update(
            current_runs=F("current_runs") + 1
        )
        node.refresh_from_db()

    def _deactivate_if_max_runs_reached(self, node: ScheduleTriggerNode) -> None:
        if not self._max_runs_reached(node):
            return
        node.is_active = False
        node.save(update_fields=["is_active", "updated_at"])
        logger.info(
            f"[ScheduleTriggerService] Node {node.id}: "
            f"max runs reached ({node.current_runs}/{node.max_runs}), "
            f"deactivated."
        )

    @staticmethod
    def _max_runs_reached(node: ScheduleTriggerNode) -> bool:
        return (
            node.end_type == ScheduleTriggerNode.EndType.AFTER_N_RUNS
            and node.max_runs is not None
            and node.current_runs >= node.max_runs
        )
