from __future__ import annotations

import json
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


class AnthropicLLMClient(BaseLLMClient):
    """Streaming + tool-calling client for Anthropic models.

    Uses litellm.acompletion with the "anthropic/<model>" prefix.  litellm
    translates Anthropic's streaming tool-use protocol into the OpenAI-compatible
    delta format so the accumulation logic is identical to OpenAILLMClient.

    Note on structured output: Anthropic does not natively enforce
    ``response_format: json_schema`` in the same way that OpenAI's gpt-4o does.
    When ``output_schema`` is supplied, litellm will attempt to translate it into
    the closest Anthropic equivalent, but adherence is best-effort.  For strict
    JSON output on Claude models, rely primarily on the system-prompt guidance
    plus the structured-tool-use pattern rather than the ``response_format`` kwarg
    alone.
    """

    def __init__(self, llm_config, output_schema: dict | None = None) -> None:
        super().__init__(output_schema=output_schema)
        self._llm_config = llm_config

    def _model_string(self) -> str:
        model = self._llm_config.model
        return f"anthropic/{model.name}"

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
        if cfg.temperature is not None:
            kwargs["temperature"] = cfg.temperature
        if cfg.max_tokens is not None:
            kwargs["max_tokens"] = cfg.max_tokens
        if cfg.top_p is not None:
            kwargs["top_p"] = cfg.top_p
        if cfg.timeout is not None:
            kwargs["timeout"] = cfg.timeout
        # Best-effort: litellm translates this for Claude, but Anthropic's
        # native support for json_schema enforcement is weaker than OpenAI's.
        # The system-prompt guidance is the primary enforcement mechanism for
        # Anthropic models; this kwarg is a secondary hint only.
        if self._output_schema:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": self._output_schema,
            }
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
        from collections import defaultdict

        kwargs = self._build_kwargs(messages, tools)
        logger.debug("AnthropicLLMClient calling model {}", kwargs.get("model"))

        tool_calls_accumulator: dict[int, dict] = defaultdict(
            lambda: {"id": "", "name": "", "args": ""}
        )

        response = await litellm.acompletion(**kwargs)

        async for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            if delta.content:
                yield TokenEvent(content=delta.content)

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
            if finish_reason in ("tool_calls", "stop", "tool_use", "end_turn"):
                break

        for acc in tool_calls_accumulator.values():
            if acc["name"]:
                try:
                    args = json.loads(acc["args"]) if acc["args"] else {}
                except json.JSONDecodeError:
                    args = {"_raw": acc["args"]}
                yield ToolCallEvent(id=acc["id"], name=acc["name"], args=args)

        yield DoneEvent()
