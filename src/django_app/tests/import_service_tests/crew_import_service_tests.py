import pytest
from tables.services.import_services import (
    AgentsImportService,
    CrewsImportService,
    TasksImportService,
)
from tables.models import TaskContext
from tests.fixtures import *


@pytest.mark.django_db
def test_create_task_basic():
    crew = Crew.objects.create(name="TestCrew")
    service = TasksImportService()

    task_data = {
        "name": "Test Task",
        "instructions": "Do something",
        "expected_output": "Something done",
        "order": 1,
        "human_input": True,
        "async_execution": False,
        "agent": None,
    }

    task = service.create_task(task_data, crew)

    assert task.name == "Test Task"
    assert service.mapped_tasks[next(iter(service.mapped_tasks))] == task
    assert task.crew == crew


@pytest.mark.django_db
def test_add_task_context_creates_context_links():
    crew = Crew.objects.create(name="TestCrew")
    service = TasksImportService()

    task1 = service.create_task(
        {
            "id": 1,
            "name": "Task 1",
            "instructions": "Test Instruction",
            "expected_output": "Test output",
            "order": 1,
            "human_input": False,
            "async_execution": False,
            "agent": None,
        },
        crew,
    )
    task2 = service.create_task(
        {
            "id": 2,
            "name": "Task 2",
            "instructions": "Test Instruction",
            "expected_output": "Test output",
            "order": 2,
            "human_input": False,
            "async_execution": False,
            "agent": None,
        },
        crew,
    )

    service.add_task_context(task2, [1])

    context = TaskContext.objects.get(task=task2)
    assert context.context == task1


@pytest.mark.django_db
def test_create_crews_with_tasks(agents_data, crew_data):
    agents_service = AgentsImportService(agents_data)
    agents_service.create_agents(tools_service=None, llm_configs_service=None)

    crews_service = CrewsImportService(crew_data)
    crews_service.create_crews(
        agents_service=agents_service, tools_service=None, llm_configs_service=None
    )

    crew = list(crews_service.mapped_crews.values())[0]
    assert crew.name == crew_data[0]["name"]
