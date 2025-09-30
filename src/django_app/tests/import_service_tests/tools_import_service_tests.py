import pytest
from tables.models import Agent, Task, TaskPythonCodeTools
from tables.services.import_services import ToolsImportService
from tests.fixtures import *


@pytest.mark.django_db
def test_create_tools(python_tool_data):
    tools_data = {
        "configured_tools": [],
        "python_tools": [python_tool_data],
    }
    service = ToolsImportService(tools_data)

    service.create_tools()

    assert 1 in service.mapped_tools["python_tools"]
    tool = service.mapped_tools["python_tools"][1]
    assert tool.name == "python tool1"
    assert tool.description == "Get user name from id"


@pytest.mark.django_db
def test_assign_tools_to_agent(python_tool_data):
    tools_data = {"configured_tools": [], "python_tools": [python_tool_data]}
    service = ToolsImportService(tools_data)
    service.create_tools()

    agent = Agent.objects.create(role="tester", goal="goal")
    tool_ids = {"configured_tools": [], "python_tools": [1]}

    service.assign_tools_to_agent(agent, tool_ids)

    assert agent.python_code_tools.count() == 1
    assert agent.python_code_tools.first().name == "python tool1"


@pytest.mark.django_db
def test_assign_tools_to_task(python_tool_data):
    tools_data = {"configured_tools": [], "python_tools": [python_tool_data]}
    service = ToolsImportService(tools_data)
    service.create_tools()

    task = Task.objects.create(name="task1")
    tool_ids = {"configured_tools": [], "python_tools": [1]}

    service.assign_tools_to_task(task, tool_ids)

    assert TaskPythonCodeTools.objects.filter(task=task).count() == 1
    tool_rel = TaskPythonCodeTools.objects.filter(task=task).first()
    assert tool_rel.tool.name == "python tool1"
