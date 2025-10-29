import os
from pathlib import Path
from django.core.management.base import BaseCommand

from tables.models import (
    Tool,
    ToolConfigField,
    EmbeddingModel,
    LLMModel,
    Provider,
    RealtimeModel,
    RealtimeTranscriptionModel,
    DefaultRealtimeAgentConfig,
)
from tables.models.crew_models import (
    Agent,
    DefaultAgentConfig,
    DefaultCrewConfig,
    DefaultToolConfig,
)
from tables.models.embedding_models import DefaultEmbeddingConfig
from tables.models.llm_models import DefaultLLMConfig
from tables.management.commands.helpers import load_json_from_file
from tables.management.commands.upload_tools import upload_tools
class Command(BaseCommand):
    help = "Upload predefined models to database"

    def handle(self, *args, **kwargs):
        upload_providers()
        upload_llm_models()
        upload_realtime_agent_models()
        upload_realtime_transcription_models()
        upload_embedding_models()
        upload_tools()
        upload_default_llm_config()
        upload_default_embedding_config()
        upload_default_realtime_agent_config()
        upload_default_agent_config()
        upload_default_crew_config()
        upload_default_tool_config()

        upload_realtime_agents()

LLM_MODELS_JSON = "llm_models.json"
EMBEDDING_MODELS_JSON = "embedding_models.json"
REALTIME_MODELS_JSON = "realtime_models.json"
TRANSCRIPTION_MODELS_JSON = "transcription_models.json"

MODEL_JSON_FILES = [
    LLM_MODELS_JSON,
    EMBEDDING_MODELS_JSON,
    REALTIME_MODELS_JSON,
    TRANSCRIPTION_MODELS_JSON,
]

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROVIDER_MODELS_DIR = BASE_DIR / "provider_models"

def get_all_providers_from_files():
    all_providers = set()
    for path in MODEL_JSON_FILES:
        js_path = PROVIDER_MODELS_DIR / path
        data = load_json_from_file(js_path)
        all_providers.update(data.keys())
    return all_providers

def upload_providers():
    current_provider_names = get_all_providers_from_files()
    for name in current_provider_names:
        Provider.objects.get_or_create(name=name)

    Provider.objects.exclude(name__in=current_provider_names).delete()


def upload_llm_models():
    path = PROVIDER_MODELS_DIR / LLM_MODELS_JSON

    models_by_provider = load_json_from_file(path)
    current_model_tuples = set()


    for provider_name, model_names in models_by_provider.items():
        provider, _ = Provider.objects.get_or_create(name=provider_name)
        for model_name in model_names:
            current_model_tuples.add((provider.pk, model_name))
            LLMModel.objects.get_or_create(
                predefined=True,
                name=model_name,
                llm_provider=provider,
            )

    LLMModel.objects.filter(predefined=True, is_custom=False).exclude(
        llm_provider_id__in=[pid for pid, _ in current_model_tuples],
        name__in=[name for _, name in current_model_tuples],
    ).delete()


def upload_realtime_agent_models():
    path = PROVIDER_MODELS_DIR / REALTIME_MODELS_JSON
    models_by_provider = load_json_from_file(path)
    current_model_tuples = set()    

    for provider_name, model_names in models_by_provider.items():
        provider, _ = Provider.objects.get_or_create(name=provider_name)
        for model_name in model_names:
            current_model_tuples.add((provider.pk, model_name))
            RealtimeModel.objects.get_or_create(
                name=model_name,
                provider=provider
            )

    RealtimeModel.objects.filter(is_custom=False).exclude(
        provider_id__in=[pid for pid, _ in current_model_tuples],
        name__in=[name for _, name in current_model_tuples],
    ).delete()

def upload_realtime_transcription_models():
    path = PROVIDER_MODELS_DIR / TRANSCRIPTION_MODELS_JSON
    models_by_provider = load_json_from_file(path)
    current_model_tuples = set()    


    for provider_name, model_names in models_by_provider.items():
        provider, _ = Provider.objects.get_or_create(name=provider_name)
        for model_name in model_names:
            current_model_tuples.add((provider.pk, model_name))
            RealtimeTranscriptionModel.objects.get_or_create(
                name=model_name,
                provider=provider
            )
            
    RealtimeTranscriptionModel.objects.filter(is_custom=False).exclude(
        provider_id__in=[pid for pid, _ in current_model_tuples],
        name__in=[name for _, name in current_model_tuples],
    ).delete()

def upload_embedding_models():
    path = PROVIDER_MODELS_DIR / EMBEDDING_MODELS_JSON
    models_by_provider = load_json_from_file(path)
    current_model_tuples = set()    
    

    for provider_name, model_names in models_by_provider.items():
        provider, _ = Provider.objects.get_or_create(name=provider_name)
        for model_name in model_names:
            current_model_tuples.add((provider.pk, model_name))
            EmbeddingModel.objects.get_or_create(
                predefined=True,
                name=model_name,
                embedding_provider=provider,
                # base_url, deployment 
            )

    EmbeddingModel.objects.filter(predefined=True, is_custom=False).exclude(
        embedding_provider_id__in=[pid for pid, _ in current_model_tuples],
        name__in=[name for _, name in current_model_tuples],
    ).delete()

def upload_realtime_agents():
    from tables.models.realtime_models import RealtimeAgent

    agent_list = Agent.objects.all()
    for agent in agent_list:
        RealtimeAgent.objects.get_or_create(
            agent=agent,
            defaults={
                "similarity_threshold": 0.2,
                "search_limit": 3,
                "wake_word": None,
                "stop_prompt": None,
                "language": None,
            },
        )

    pass


def upload_default_llm_config():
    DefaultLLMConfig.objects.filter().delete()
    DefaultLLMConfig.objects.create(id=1)


def upload_default_embedding_config():
    DefaultEmbeddingConfig.objects.filter().delete()
    DefaultEmbeddingConfig.objects.create(id=1)


def upload_default_agent_config():
    DefaultAgentConfig.objects.all().delete()
    DefaultAgentConfig.objects.create(id=1)


def upload_default_realtime_agent_config():
    DefaultRealtimeAgentConfig.objects.all().delete()
    DefaultRealtimeAgentConfig.objects.create(id=1)


def upload_default_crew_config():
    DefaultCrewConfig.objects.all().delete()
    DefaultCrewConfig.objects.create(id=1)


def upload_default_tool_config():
    DefaultToolConfig.objects.all().delete()
    DefaultToolConfig.objects.create(id=1)
