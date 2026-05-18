from __future__ import annotations

import json
from collections import defaultdict
from typing import AsyncIterator

import litellm

from utils.logger import logger

from .base import (
    BaseLLMClient,
    DoneEvent,
    StreamEvent,
    TokenEvent,
    ToolCallEvent,
    ToolSpec,
)


class OpenAILLMClient(BaseLLMClient):
    """Streaming + tool-calling client for OpenAI-compatible models.

    Uses litellm.acompletion which is already a project dependency and
    handles OpenAI's streaming protocol (including chunked tool-call assembly).

    When ``output_schema`` is provided, a ``response_format: json_schema``
    kwarg is added to the litellm call.  Modern gpt-4o+ models support both
    ``tools`` and ``response_format`` simultaneously; litellm passes them
    through unchanged.
    """

    def __init__(self, llm_config, output_schema: dict | None = None) -> None:
        super().__init__(output_schema=output_schema)
        self._llm_config = llm_config

    def _model_string(self) -> str:
        model = self._llm_config.model
        # litellm expects "openai/<model-name>" or just "<model-name>" for openai
        provider_name = (
            (model.llm_provider.name or "").lower() if model.llm_provider else "openai"
        )
        if provider_name == "openai":
            return model.name
        # Azure uses "azure/<deployment>"
        if provider_name == "azure":
            deployment = model.deployment_id or model.name
            return f"azure/{deployment}"
        return f"{provider_name}/{model.name}"

    def _build_tools(self, tools: list[ToolSpec]) -> list[dict] | None:
        if not tools:
            return None
        return [
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                },
            }
            for spec in tools
        ]

    def _build_kwargs(self, messages: list[dict], tools: list[ToolSpec]) -> dict:
        cfg = self._llm_config
        model = cfg.model

        kwargs: dict = {
            "model": self._model_string(),
            "messages": messages,
            "stream": True,
        }

        if cfg.api_key:
            kwargs["api_key"] = cfg.api_key
        if model and model.base_url:
            kwargs["base_url"] = model.base_url
        if model and model.api_version:
            kwargs["api_version"] = model.api_version
        if cfg.temperature is not None:
            kwargs["temperature"] = cfg.temperature
        if cfg.max_tokens is not None:
            kwargs["max_tokens"] = cfg.max_tokens
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.presence_penalty is not None:
            kwargs["presence_penalty"] = cfg.presence_penalty
        if cfg.frequency_penalty is not None:
            kwargs["frequency_penalty"] = cfg.frequency_penalty
        if cfg.seed is not None:
            kwargs["seed"] = cfg.seed
        if cfg.timeout is not None:
            kwargs["timeout"] = cfg.timeout
        # Caller-supplied output schema takes precedence over the config-level
        # response_format field so that the structured-output feature can
        # override without mutating the persisted LLMConfig row.
        if self._output_schema:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": self._output_schema,
            }
        elif cfg.response_format:
            kwargs["response_format"] = cfg.response_format
        if cfg.extra_headers:
            kwargs["extra_headers"] = cfg.extra_headers

        tool_list = self._build_tools(tools)
        if tool_list:
            kwargs["tools"] = tool_list

        return kwargs

    async def stream_completion(
        self,
        messages: list[dict],
        tools: list[ToolSpec],
    ) -> AsyncIterator[StreamEvent]:
        kwargs = self._build_kwargs(messages, tools)
        logger.debug("OpenAILLMClient calling model {}", kwargs.get("model"))

        # Accumulate tool-call chunks: tool_call_id -> {id, name, args_chunks}
        tool_calls_accumulator: dict[int, dict] = defaultdict(
            lambda: {"id": "", "name": "", "args": ""}
        )

        response = await litellm.acompletion(**kwargs)

        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            # Text token
            if delta.content:
                yield TokenEvent(content=delta.content)

            # Tool call chunks
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    acc = tool_calls_accumulator[tc.index]
                    if tc.id:
                        acc["id"] = tc.id
                    if tc.function and tc.function.name:
                        acc["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        acc["args"] += tc.function.arguments

            finish_reason = chunk.choices[0].finish_reason if chunk.choices else None
            if finish_reason in ("tool_calls", "stop"):
                break

        # Emit completed tool calls
        for acc in tool_calls_accumulator.values():
            if acc["name"]:
                try:
                    args = json.loads(acc["args"]) if acc["args"] else {}
                except json.JSONDecodeError:
                    args = {"_raw": acc["args"]}
                yield ToolCallEvent(id=acc["id"], name=acc["name"], args=args)

        yield DoneEvent()
