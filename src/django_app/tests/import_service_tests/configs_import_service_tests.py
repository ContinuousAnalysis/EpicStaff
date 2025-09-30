import pytest
from tables.services.import_services import LLMConfigsImportService
from tests.fixtures import *


@pytest.mark.django_db
def test_llm_configs_import(llm_config_data):
    service = LLMConfigsImportService([llm_config_data])

    service.create_configs()
    config = service.get_config(386)

    assert config is not None
    assert config.model.name == "gpt-4o"
    assert config.custom_name == "quickstart"
    assert config.is_visible is True


@pytest.mark.django_db
def test_realtime_configs_import(realtime_config_data):
    service = RealtimeConfigsImportService([realtime_config_data])

    service.create_configs()
    config = service.get_config(3)

    assert config is not None
    assert config.realtime_model.name == "Test Realtime Model"
    assert config.custom_name == "RealtimeTest"


@pytest.mark.django_db
def test_transcription_configs_import(transcription_config_data):
    service = RealtimeTranscriptionConfigsImportService([transcription_config_data])

    service.create_configs()
    config = service.get_config(1)

    assert config is not None
    assert config.realtime_transcription_model.name == "whisper-1"
    assert config.custom_name == "TranscriptionModel"
