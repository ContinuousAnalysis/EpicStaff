import pytest
from tables.services.import_services import RealtimeAgentImportService
from tests.fixtures import *


@pytest.mark.django_db
def test_create_realtime_agent_with_configs(
    agents_map, realtime_agent_data, rt_config_service, rt_transcription_service
):
    service = RealtimeAgentImportService(realtime_agent_data)
    service.create_agents(
        agents=agents_map,
        rt_config_service=rt_config_service,
        rt_transcription_config_service=rt_transcription_service,
    )

    agent = list(agents_map.values())[0]
    rt_agent = agent.realtime_agent

    assert rt_agent is not None
    assert rt_agent.voice == "alloy"
    assert rt_agent.realtime_config.realtime_model.name == "Test Realtime Model"
    assert (
        rt_agent.realtime_transcription_config.realtime_transcription_model.name
        == "whisper-1"
    )


@pytest.mark.django_db
def test_create_realtime_agent_without_optional_configs(agents_map):
    realtime_agent_data = [
        {"id": 123, "custom_name": "RT Agent No Config", "voice": "alloy"}
    ]
    service = RealtimeAgentImportService(realtime_agent_data)
    service.create_agents(agents=agents_map)

    agent = list(agents_map.values())[0]
    rt_agent = agent.realtime_agent

    assert rt_agent is not None
    assert rt_agent.voice == "alloy"
    assert rt_agent.realtime_config is None
    assert rt_agent.realtime_transcription_config is None
