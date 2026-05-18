from __future__ import annotations

import re

from asgiref.sync import sync_to_async
from django.db import transaction
from django.utils import timezone

from utils.logger import logger

from tables.models.flow_assistant_models import FlowAssistantConversation
from tables.services.redis_service import RedisService
from .constants import (
    _CANCEL_KEY,
    _CANCEL_TTL_SECONDS,
    _MD_TABLE_PATTERN,
    _TITLE_MAX_CHARS,
)


def _strip_markdown_tables(text: str) -> str:
    """Remove GitHub-flavored markdown tables from text.

    Defensive — the system prompt instructs the LLM to put table data only in
    `ef_tables`, but it drifts. We strip duplicates at persistence time so
    stored conversations don't show the same data twice when re-opened.
    """
    cleaned = _MD_TABLE_PATTERN.sub("\n", text)
    # Collapse 3+ consecutive newlines to two
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _derive_title(message: str) -> str:
    """Truncate message to at most 50 characters at a word boundary, append '…' if truncated."""
    text = message.strip()
    if len(text) <= _TITLE_MAX_CHARS:
        return text
    truncated = text[:_TITLE_MAX_CHARS]
    # Walk back to the last whitespace so we don't cut mid-word.
    last_space = truncated.rfind(" ")
    if last_space > 0:
        truncated = truncated[:last_space]
    return truncated + "…"


def _messages_for_llm(messages: list[dict]) -> list[dict]:
    """Return a copy of `messages` with stale tool_results stubbed.

    "Stale" = any tool message preceding the last user message (i.e., from a
    prior turn). The current turn's tool results stay intact because the LLM
    may be mid multi-tool-call loop.

    Eviction is safe only because every Flow Assistant tool is a pure,
    idempotent read. If a future tool has side effects or non-deterministic
    output, exclude it from eviction (or add a per-tool whitelist).
    """
    # Find the index of the last user message.
    last_user_idx = -1
    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            last_user_idx = i

    # No user message or it's the very first message — return a plain copy.
    if last_user_idx <= 0:
        return list(messages)

    # Build tool_call_id → (name, args_str) from assistant messages before the last user turn.
    call_map: dict[str, tuple[str, str]] = {}
    for msg in messages[:last_user_idx]:
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            for tc in msg["tool_calls"]:
                tc_id = tc.get("id", "")
                fn = tc.get("function", {})
                call_map[tc_id] = (fn.get("name", ""), fn.get("arguments", ""))

    # Build output list, stubbing stale tool messages.
    result: list[dict] = []
    for i, msg in enumerate(messages):
        if i >= last_user_idx or msg.get("role") != "tool":
            result.append(msg)
            continue

        content = msg.get("content", "")
        if isinstance(content, str) and content.startswith(
            "[tool result from an earlier turn"
        ):
            # Already stubbed — idempotent pass-through.
            result.append(msg)
            continue

        tc_id = msg.get("tool_call_id", "")
        if tc_id not in call_map:
            # Defensive: unknown call id — pass through unchanged.
            result.append(msg)
            continue

        name, args = call_map[tc_id]
        args_display = args if len(args) <= 200 else args[:200] + "…"
        stub = (
            f"[tool result from an earlier turn was omitted to save context. "
            f"tool: {name}, args: {args_display}. "
            f"The assistant already used this result; do not re-call unless the user "
            f"explicitly asks for fresh data.]"
        )
        result.append({**msg, "content": stub})

    return result


@sync_to_async
def _persist_messages(conversation_id: int, messages: list[dict]) -> None:
    """Atomically overwrite the conversation's message history."""
    with transaction.atomic():
        FlowAssistantConversation.objects.filter(pk=conversation_id).update(
            messages=messages,
            last_message_at=timezone.now(),
        )


async def _request_cancel(conv_id: int) -> None:
    """Set the cancel flag for a conversation (TTL: 300 s)."""
    redis_service = RedisService()
    key = _CANCEL_KEY.format(conv_id=conv_id)
    await sync_to_async(redis_service.redis_client.set)(
        key, "1", ex=_CANCEL_TTL_SECONDS
    )


async def _is_cancel_requested(conv_id: int) -> bool:
    """Return True if a cancel flag is set for this conversation."""
    redis_service = RedisService()
    key = _CANCEL_KEY.format(conv_id=conv_id)
    return bool(await sync_to_async(redis_service.redis_client.get)(key))


async def _clear_cancel_flag(conv_id: int) -> None:
    """Remove the cancel flag, if present."""
    redis_service = RedisService()
    key = _CANCEL_KEY.format(conv_id=conv_id)
    await sync_to_async(redis_service.redis_client.delete)(key)
