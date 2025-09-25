import pytest
from tables.models import Crew, Task
from tables.services.import_services import AgentsImportService
from tests.fixtures import *


@pytest.mark.django_db
def test_create_agents_basic(agents_data):
    service = AgentsImportService(agents_data)
    service.create_agents(tools_service=None, llm_configs_service=None)

    # Both agents should be mapped
    assert 679 in service.mapped_agents
    assert 694 in service.mapped_agents

    agent1 = service.mapped_agents[679]
    agent2 = service.mapped_agents[694]

    assert agent1.role == "Test"
    assert agent2.role == "Death Star operator"

    # Tools and configs are not assigned in this test
    assert agent1.python_code_tools.count() == 0
    assert agent2.python_code_tools.count() == 0
    assert agent1.llm_config is None
    assert agent2.llm_config is None


@pytest.mark.django_db
def test_assign_agents_to_crew(agents_data):
    service = AgentsImportService(agents_data)
    service.create_agents(tools_service=None, llm_configs_service=None)

    crew = Crew.objects.create(name="TestCrew")
    service.assign_agents_to_crew([679, 694], crew)

    assert crew.agents.count() == 2
    roles = set(a.role for a in crew.agents.all())
    assert "Test" in roles
    assert "Death Star operator" in roles


@pytest.mark.django_db
def test_assign_agent_to_task(agents_data):
    service = AgentsImportService(agents_data)
    service.create_agents(tools_service=None, llm_configs_service=None)

    task = Task.objects.create(name="TestTask")
    service.assign_agent_to_task(task, 694)

    assert task.agent.role == "Death Star operator"


@pytest.mark.django_db
def test_assign_agents_to_crew_raises_error_for_invalid_id(agents_data):
    service = AgentsImportService(agents_data)
    service.create_agents(tools_service=None, llm_configs_service=None)
    crew = Crew.objects.create(name="TestCrew")

    with pytest.raises(ValueError):
        service.assign_agents_to_crew([999], crew)


@pytest.mark.django_db
def test_assign_agent_to_task_raises_error_for_invalid_id(agents_data):
    service = AgentsImportService(agents_data)
    service.create_agents(tools_service=None, llm_configs_service=None)
    task = Task.objects.create(name="TestTask")

    with pytest.raises(ValueError):
        service.assign_agent_to_task(task, 999)
