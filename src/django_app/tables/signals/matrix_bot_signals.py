import json

from loguru import logger
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from tables.models.matrix_bot_models import MatrixBot
from tables.services.redis_service import RedisService


@receiver(post_save, sender=MatrixBot)
def matrix_bot_post_save_handler(sender, instance: MatrixBot, created: bool, **kwargs):
    event = "created" if created else "updated"
    logger.info(f"MatrixBot {event}: id={instance.pk}")
    try:
        redis = RedisService()
        payload = json.dumps({"event": event, "bot_id": instance.pk})
        redis.redis_client.publish("matrix:bots:update", payload)
    except Exception:
        logger.exception("Failed to publish MatrixBot {event} event", event=event)


@receiver(post_delete, sender=MatrixBot)
def matrix_bot_post_delete_handler(sender, instance: MatrixBot, **kwargs):
    logger.info(f"MatrixBot deleted: id={instance.pk}")
    try:
        redis = RedisService()
        payload = json.dumps({"event": "deleted", "bot_id": instance.pk})
        redis.redis_client.publish("matrix:bots:update", payload)
    except Exception:
        logger.exception("Failed to publish MatrixBot deleted event")
