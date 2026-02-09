from django.db.models import QuerySet
from tables.models import Task
from tables.exceptions import TaskValidationError


class TaskValidator:
    def validate_assigned_agents(self, task_list: QuerySet[Task]) -> None:
        """
        Validate that all tasks in the queryset have an assigned agent.
        Raises TaskValidationError if any tasks are missing agents.
        """

        tasks_without_agent = task_list.filter(agent=None)

        if tasks_without_agent.exists():
            error_tasks = tasks_without_agent.values_list("name", flat=True)
            raise TaskValidationError(
                f"Tasks [{', '.join(error_tasks)}] have not assigned agents"
            )
