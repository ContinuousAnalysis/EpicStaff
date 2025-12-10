# Define the models to use in the agent (env-driven)

import os

from dotenv import load_dotenv
from os_computer_use import providers


load_dotenv()


def _make_grounding_provider(name: str, model: str):
    """Return a grounding-capable provider based on env settings."""
    name = (name or "").lower()
    if name in ("showui", "show_ui"):
        return providers.ShowUIProvider()
    if name in ("osatlas", "os_atlas", "atlas"):
        return providers.OSAtlasProvider()
    # Fallback to OpenAI-style vision provider using the model name
    return providers.OpenAIProvider(model)


def _make_llm_provider(provider: str, model: str):
    """Return an LLM provider (vision/action) based on env settings."""
    name = (provider or "").lower()
    if name in ("openai", ""):
        return providers.OpenAIProvider(model)
    if name == "anthropic":
        return providers.AnthropicProvider(model)
    if name == "fireworks":
        return providers.FireworksProvider(model)
    if name == "mistral":
        return providers.MistralProvider(model)
    if name == "groq":
        return providers.GroqProvider(model)
    if name == "moonshot":
        return providers.MoonshotProvider(model)
    if name == "deepseek":
        return providers.DeepSeekProvider(model)
    if name == "openrouter":
        return providers.OpenRouterProvider(model)
    if name == "llama":
        return providers.LlamaProvider(model)
    if name == "gemini":
        return providers.GeminiProvider(model)
    # Default
    return providers.OpenAIProvider(model)


# Environment overrides (with sensible defaults)
GROUNDING_PROVIDER = os.getenv("OCU_GROUNDING_PROVIDER", "showui")
GROUNDING_MODEL = os.getenv("OCU_GROUNDING_MODEL", "gpt-4o")

VISION_PROVIDER = os.getenv("OCU_VISION_PROVIDER", "openai")
VISION_MODEL = os.getenv("OCU_VISION_MODEL", "gpt-4o")

ACTION_PROVIDER = os.getenv("OCU_ACTION_PROVIDER", "openai")
ACTION_MODEL = os.getenv("OCU_ACTION_MODEL", "gpt-4o")

# Instantiate providers
grounding_model = _make_grounding_provider(GROUNDING_PROVIDER, GROUNDING_MODEL)
vision_model = _make_llm_provider(VISION_PROVIDER, VISION_MODEL)
action_model = _make_llm_provider(ACTION_PROVIDER, ACTION_MODEL)
