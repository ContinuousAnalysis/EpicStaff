import json

from loguru import logger
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from tables.models.graph_models import ScheduleTriggerNode
from tables.services.redis_service import RedisService


def _flat_schedule_payload(instance: ScheduleTriggerNode) -> dict:
    """
    Flat wire-protocol projection for the Django→Manager Redis channel.

    The public HTTP serializer groups fields under a nested `schedule` block,
    but the Manager-side consumers (ScheduleService, ScheduleTriggerNodeRepository)
    read flat keys directly. Keep this helper's shape in sync with
    ScheduleTriggerNodeRepository.get_all_active_schedule_nodes() — changing
    either side without the other will break the Manager.
    """
    return {
        "id": instance.pk,
        "node_name": instance.node_name,
        "graph": instance.graph_id,
        "is_active": instance.is_active,
        "run_mode": instance.run_mode,
        "start_date_time": (
            instance.start_date_time.isoformat()
            if instance.start_date_time else None
        ),
        "every": instance.every,
        "unit": instance.unit,
        "weekdays": instance.weekdays,
        "end_type": instance.end_type,
        "end_date_time": (
            instance.end_date_time.isoformat()
            if instance.end_date_time else None
        ),
        "max_runs": instance.max_runs,
        "current_runs": instance.current_runs,
    }


@receiver(post_save, sender=ScheduleTriggerNode)
def schedule_trigger_post_save_handler(sender, instance: ScheduleTriggerNode, created, **kwargs):
    """
    Publishes 'create' or 'update' event to Redis after saving a node.

    Input:
        instance  — saved ScheduleTriggerNode instance
        created   — True if the object was just created

    Output:
        Message to Redis channel 'schedule_channel':
        {
          "action": "node_update",
          "data": {
            "action": "create" | "update",
            "node": <serialized ScheduleTriggerNode>
          }
        }
    """
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
        logger.exception(f"[ScheduleSignal] Error publishing save event for node {node_id}")


@receiver(post_delete, sender=ScheduleTriggerNode)
def schedule_trigger_post_delete_handler(sender, instance: ScheduleTriggerNode, **kwargs):
    """
    Publishes 'delete' event to Redis after removing a node.

    Input:
        instance  — deleted ScheduleTriggerNode instance (pk still available)

    Output:
        Message to Redis channel 'schedule_channel':
        {
          "action": "node_update",
          "data": {
            "action": "delete",
            "node": {"id": <id>}
          }
        }
    """
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
        logger.exception(f"[ScheduleSignal] Error publishing delete event for node {node_id}")
