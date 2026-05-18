from __future__ import annotations

from .anthropic_client import AnthropicLLMClient
from .base import (
    BaseLLMClient,
    DoneEvent,
    StreamEvent,
    StructuredEvent,
    TokenEvent,
    ToolCallEvent,
    ToolResultEvent,
    ToolSpec,
    UnsupportedLLMProviderError,
)
from .openai_client import OpenAILLMClient

__all__ = [
    "BaseLLMClient",
    "DoneEvent",
    "OpenAILLMClient",
    "AnthropicLLMClient",
    "StreamEvent",
    "StructuredEvent",
    "TokenEvent",
    "ToolCallEvent",
    "ToolResultEvent",
    "ToolSpec",
    "UnsupportedLLMProviderError",
    "get_llm_client",
]

# Lowercase provider-name → client class mapping
_PROVIDER_MAP: dict[str, type[BaseLLMClient]] = {
    "openai": OpenAILLMClient,
    "azure": OpenAILLMClient,
    "azure_openai": OpenAILLMClient,
    "anthropic": AnthropicLLMClient,
}


def get_llm_client(
    llm_config,
    output_schema: dict | None = None,
) -> BaseLLMClient:
    """Factory that returns the right client for the given LLMConfig.

    ``output_schema`` is forwarded to the client constructor so callers can
    request structured JSON output (e.g. ``response_format: json_schema``)
    without mutating the persisted ``LLMConfig`` row.

    Raises ``UnsupportedLLMProviderError`` for unknown providers.
    """
    model = llm_config.model
    provider_name = ""
    if model and model.llm_provider:
        provider_name = (model.llm_provider.name or "").lower()

    client_cls = _PROVIDER_MAP.get(provider_name)
    if client_cls is None:
        raise UnsupportedLLMProviderError(provider_name)
    return client_cls(llm_config, output_schema=output_schema)
