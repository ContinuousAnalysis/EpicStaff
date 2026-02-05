import pytest
from tables.models import Task, TaskContext
from tables.serializers.model_serializers import TaskWriteSerializer
from tables.exceptions import InvalidTaskOrderError
from rest_framework.exceptions import ValidationError


@pytest.fixture
def task_factory(db):
    counter = {"count": 0}

    def make_task(
        name=None,
        order=None,
        instructions="Default instructions",
        expected_output="Default output",
        crew=None,
        agent=None,
        human_input=False,
        async_execution=False,
        config=None,
        output_model=None,
    ):
        counter["count"] += 1
        if name is None:
            name = f"Task {counter['count']}"

        task = Task.objects.create(
            name=name,
            instructions=instructions,
            expected_output=expected_output,
            order=order,
            crew=crew,
            agent=agent,
            human_input=human_input,
            async_execution=async_execution,
            config=config,
            output_model=output_model,
        )
        return task

    return make_task


@pytest.mark.django_db
def test_reorder_task_no_context(task_factory):
    """1. Reordering a task with no context should succeed."""
    task = task_factory(order=1)

    serializer = TaskWriteSerializer(task, data={"order": 2}, partial=True)
    serializer.is_valid(raise_exception=True)
    validated_data = serializer.validated_data

    assert validated_data["order"] == 2
    assert "_validated_context_ids" not in validated_data


@pytest.mark.django_db
def test_reorder_task_with_valid_context(task_factory):
    """2. Reordering a task with context in a valid way should succeed."""
    context_task = task_factory(order=1)
    task = task_factory(order=2)
    TaskContext.objects.create(task=task, context=context_task)

    serializer = TaskWriteSerializer(
        task,
        data={"order": 3},
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    validated_data = serializer.validated_data

    assert validated_data["order"] == 3
    assert "_validated_context_ids" not in validated_data


@pytest.mark.django_db
def test_reorder_task_with_invalid_context(task_factory):
    """3. Reordering a task so that it violates context ordering should fail."""
    context_task = task_factory(order=2)
    task = task_factory(order=3)
    TaskContext.objects.create(task=task, context=context_task)

    serializer = TaskWriteSerializer(
        task,
        data={"order": 1},
        partial=True,
    )

    with pytest.raises(InvalidTaskOrderError):
        serializer.is_valid(raise_exception=True)


@pytest.mark.django_db
def test_add_new_valid_context(task_factory):
    """4. Adding a new valid context to a task should succeed."""
    context_task = task_factory(order=1)
    task = task_factory(order=3)

    serializer = TaskWriteSerializer(
        task,
        data={
            "name": task.name,
            "instructions": task.instructions,
            "expected_output": task.expected_output,
            "order": task.order,
            "task_context_list": [context_task.id],
        },
        partial=False,
    )

    serializer.is_valid(raise_exception=True)
    validated_data = serializer.validated_data

    assert validated_data["_validated_context_ids"] == [context_task.id]


@pytest.mark.django_db
def test_add_new_invalid_context(task_factory):
    """5. Adding a new context that violates ordering should fail."""
    context_task = task_factory(order=5)
    task = task_factory(order=3)

    serializer = TaskWriteSerializer(
        task,
        data={
            "name": task.name,
            "instructions": task.instructions,
            "expected_output": task.expected_output,
            "order": task.order,
            "task_context_list": [context_task.id],
        },
        partial=False,
    )

    with pytest.raises(ValidationError):
        serializer.is_valid(raise_exception=True)


@pytest.mark.django_db
def test_delete_context(task_factory):
    """6. Deleting all contexts from a task should succeed."""
    context_task = task_factory(order=1)
    task = task_factory(order=3)
    TaskContext.objects.create(task=task, context=context_task)

    serializer = TaskWriteSerializer(
        task,
        data={"task_context_list": [], "order": 3},
        partial=True,
    )
    serializer.is_valid(raise_exception=True)
    validated_data = serializer.validated_data

    assert validated_data["_validated_context_ids"] == []


@pytest.mark.django_db
def test_reorder_context_task_valid_move(task_factory):
    """7. Moving a context task to another valid position should succeed."""
    context_task = task_factory(order=1)
    task = task_factory(order=3)
    TaskContext.objects.create(task=task, context=context_task)

    serializer = TaskWriteSerializer(
        context_task,
        data={"order": 2},
        partial=True,
    )

    serializer.is_valid(raise_exception=True)
    assert serializer.validated_data["order"] == 2


@pytest.mark.django_db
def test_reorder_context_task_invalid_move(task_factory):
    """8. Moving a context task to another invalid position should fail."""
    context_task = task_factory(order=1)
    task = task_factory(order=2)
    TaskContext.objects.create(task=task, context=context_task)

    serializer = TaskWriteSerializer(
        context_task,
        data={"order": 3},
        partial=True,
    )

    with pytest.raises(InvalidTaskOrderError):
        serializer.is_valid(raise_exception=True)
