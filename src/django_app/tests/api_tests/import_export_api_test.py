import pytest
import json
from django.urls import reverse
from tests.fixtures import *


@pytest.mark.django_db
def test_agent_export(api_client, seeded_db):
    agent = seeded_db["agents"][0]

    url = reverse("agent-export", kwargs={"pk": agent.id})
    response = api_client.get(url)

    assert response.status_code == 200

    content_disposition = response.headers.get("Content-Disposition", "")
    assert agent.role in content_disposition

    data = json.loads(response.content)

    configured_tools = data["tools"]["configured_tools"]
    assert len(configured_tools) == 1
    assert configured_tools[0]["name"] == "tool1"

    assert data["entity_type"] == "Agent"
    assert data["role"] == "agent1"
    assert data["goal"] == "goal1"


@pytest.mark.django_db
def test_agent_import(api_client, agent_export):
    url = reverse("agent-import-entity")
    data = {"file": agent_export["file"]}

    config_tools_before = ToolConfig.objects.count()
    previous_agents = Agent.objects.count()

    response = api_client.post(url, data, format="multipart")

    assert response.status_code == 200

    total_agents = Agent.objects.count()
    assert total_agents == previous_agents + 1

    config_tools_count = ToolConfig.objects.count()
    assert config_tools_count == config_tools_before + 1


@pytest.mark.django_db
def test_crew_export(api_client, seeded_db):
    crew = seeded_db["crews"][0]

    url = reverse("crew-export", kwargs={"pk": crew.id})
    response = api_client.get(url)

    assert response.status_code == 200

    content_disposition = response.headers.get("Content-Disposition", "")
    assert crew.name in content_disposition

    data = json.loads(response.content)

    configured_tools = data["tools"]["configured_tools"]
    assert len(configured_tools) == 1
    assert configured_tools[0]["name"] == "tool1"

    python_code_tools = data["tools"]["python_tools"]
    assert len(python_code_tools) == 1

    agents_data = data["agents"]
    assert len(agents_data) == 2

    assert data["entity_type"] == "Project"
    assert data["name"] == "crew1"


@pytest.mark.django_db
def test_crew_import(api_client, crew_export):
    url = reverse("crew-import-entity")
    data = {"file": crew_export["file"]}

    config_tools_before = ToolConfig.objects.count()
    python_tools_before = PythonCodeTool.objects.count()
    previous_crews = Crew.objects.count()

    response = api_client.post(url, data, format="multipart")

    assert response.status_code == 200

    total_crews = Crew.objects.count()
    assert total_crews == previous_crews + 1

    config_tools_count = ToolConfig.objects.count()
    assert config_tools_count == config_tools_before + 1

    python_tools_count = PythonCodeTool.objects.count()
    assert python_tools_count == python_tools_before + 1


@pytest.mark.django_db
def test_graph_export(api_client, seeded_db):
    graph = seeded_db["graph"]

    url = reverse("graphs-export", kwargs={"pk": graph.id})
    response = api_client.get(url)

    assert response.status_code == 200

    content_disposition = response.headers.get("Content-Disposition", "")
    assert graph.name in content_disposition

    data = json.loads(response.content)

    configured_tools = data["tools"]["configured_tools"]
    assert len(configured_tools) == 1
    assert configured_tools[0]["name"] == "tool1"

    python_code_tools = data["tools"]["python_tools"]
    assert len(python_code_tools) == 1

    crew_nodes = data["crew_node_list"]
    assert len(crew_nodes) == 2

    agents_data = data["agents"]
    assert len(agents_data) == 4

    assert data["entity_type"] == "Flow"
    assert data["name"] == "graph1"


@pytest.mark.django_db
def test_graph_import(api_client, graph_export):
    url = reverse("graphs-import-entity")
    data = {"file": graph_export["file"]}

    config_tools_before = ToolConfig.objects.count()
    python_tools_before = PythonCodeTool.objects.count()
    previous_graphs = Graph.objects.count()
    previous_crews = Crew.objects.count()
    previous_agents = Agent.objects.count()
    previous_crew_nodes = CrewNode.objects.count()

    response = api_client.post(url, data, format="multipart")

    assert response.status_code == 200

    total_graphs = Graph.objects.count()
    assert total_graphs == previous_graphs + 1

    total_crews = Crew.objects.count()
    assert total_crews == previous_crews + 2

    total_crew_nodes = CrewNode.objects.count()
    assert total_crew_nodes == previous_crew_nodes + 2

    total_agents = Agent.objects.count()
    assert total_agents == previous_agents + 4

    config_tools_count = ToolConfig.objects.count()
    assert config_tools_count == config_tools_before + 1

    python_tools_count = PythonCodeTool.objects.count()
    assert python_tools_count == python_tools_before + 1
