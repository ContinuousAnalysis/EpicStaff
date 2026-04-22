import json

from loguru import logger
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from tables.models.graph_models import ScheduleTriggerNode
from tables.services.redis_service import RedisService


def _flat_schedule_payload(instance: ScheduleTriggerNode) -> dict:
    """Flat projection of a ScheduleTriggerNode for the Django→Manager Redis channel.

    Shape must stay in sync with ScheduleTriggerNodeRepository.get_all_active_schedule_nodes() —
    Manager reads these keys directly, not the nested HTTP form.
    """
    return {
        "id": instance.pk,
        "node_name": instance.node_name,
        "graph": instance.graph_id,
        "is_active": instance.is_active,
        "run_mode": instance.run_mode,
        "start_date_time": (
            instance.start_date_time.isoformat() if instance.start_date_time else None
        ),
        "every": instance.every,
        "unit": instance.unit,
        "weekdays": instance.weekdays,
        "end_type": instance.end_type,
        "end_date_time": (
            instance.end_date_time.isoformat() if instance.end_date_time else None
        ),
        "max_runs": instance.max_runs,
        "current_runs": instance.current_runs,
    }


@receiver(post_save, sender=ScheduleTriggerNode)
def schedule_trigger_post_save_handler(
    sender, instance: ScheduleTriggerNode, created, **kwargs
):
    """Publish a create/update event to the Manager on every node save."""
    node_id = instance.pk
    logger.info(f"[ScheduleSignal] post_save triggered for node ID: {node_id}")

    try:
        redis_service = RedisService()
        action = "create" if created else "update"
        payload = {
            "action": "node_update",
            "data": {
                "action": action,
                "node": _flat_schedule_payload(instance),
            },
        }
        redis_service.redis_client.publish("schedule_channel", json.dumps(payload))
        logger.info(f"[ScheduleSignal] Published '{action}' for node ID: {node_id}")
    except Exception:
        logger.exception(
            f"[ScheduleSignal] Error publishing save event for node {node_id}"
        )


@receiver(post_delete, sender=ScheduleTriggerNode)
def schedule_trigger_post_delete_handler(
    sender, instance: ScheduleTriggerNode, **kwargs
):
    """Publish a delete event to the Manager on every node delete."""
    node_id = instance.pk
    logger.info(f"[ScheduleSignal] post_delete triggered for node ID: {node_id}")

    try:
        redis_service = RedisService()
        payload = {
            "action": "node_update",
            "data": {
                "action": "delete",
                "node": {"id": node_id},
            },
        }
        redis_service.redis_client.publish("schedule_channel", json.dumps(payload))
        logger.info(f"[ScheduleSignal] Published 'delete' for node ID: {node_id}")
    except Exception:
        logger.exception(
            f"[ScheduleSignal] Error publishing delete event for node {node_id}"
        )
