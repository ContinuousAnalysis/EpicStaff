from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from tables.models import PythonCodeToolConfigField, PythonCodeToolConfig
import logging

logger = logging.getLogger(__name__)


@receiver([post_save, post_delete], sender=PythonCodeToolConfigField)
def cleanup_tool_configs_on_field_change(sender, instance, **kwargs):
    """
    Triggers after a PythonCodeToolConfigField is saved (created/updated) or deleted.
    It performs a bulk deletion of all PythonCodeToolConfig objects linked to the same parent tool.
    """

    tool_id_to_cleanup = instance.tool_id

    if tool_id_to_cleanup is None:
        return

    if "created" in kwargs:
        action = "saved (created)"
    elif kwargs.get("update_fields"):
        action = "saved (updated)"
    else:
        action = "deleted"

    try:
        deleted_count, details = PythonCodeToolConfig.objects.filter(
            tool_id=tool_id_to_cleanup
        ).delete()

        if deleted_count > 0:
            logger.info(
                f"Signal: PythonCodeToolConfigField was {action} (Field ID: {instance.pk}). "
                f"Deleted {deleted_count} related PythonCodeToolConfig records for tool_id={tool_id_to_cleanup}."
            )
        else:
            logger.debug(
                f"Signal: PythonCodeToolConfigField was {action} (Field ID: {instance.pk}). "
                f"No PythonCodeToolConfig records found to delete for tool_id={tool_id_to_cleanup}."
            )

    except Exception as e:
        logger.error(
            f"Critical error during PythonCodeToolConfig cleanup (Tool ID: {tool_id_to_cleanup}): {e}"
        )
