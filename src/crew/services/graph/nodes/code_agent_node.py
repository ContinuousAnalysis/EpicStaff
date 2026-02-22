"""
Code Agent Node — sends prompts to OpenCode via the Instance Manager,
polls for responses, streams chunks via StreamWriter, and runs user-defined
stream handler callbacks.
"""

import asyncio
import hashlib
import json
import threading
import time
import urllib.request
from typing import Any

from langgraph.types import StreamWriter
from loguru import logger

from src.crew.models.state import State
from src.crew.services.graph.events import StopEvent
from src.crew.services.graph.exceptions import StopSession
from src.crew.services.graph.nodes import BaseNode
from src.crew.services.run_python_code_service import RunPythonCodeService
from src.crew.models.request_models import PythonCodeData


CODE_CONTAINER_URL = "http://code:4080"


class CodeAgentNode(BaseNode):
    TYPE = "CODE_AGENT"

    def __init__(
        self,
        session_id: int,
        node_name: str,
        stop_event: StopEvent,
        input_map: dict,
        output_variable_path: str,
        python_code_executor_service: RunPythonCodeService,
        graph_id: int | None = None,
        llm_config_id: int | None = None,
        agent_mode: str = "build",
        system_prompt: str = "",
        stream_handler_code: str = "",
        libraries: list[str] | None = None,
        polling_interval_ms: int = 1000,
        silence_indicator_s: int = 3,
        indicator_repeat_s: int = 5,
        chunk_timeout_s: int = 30,
        inactivity_timeout_s: int = 120,
        max_wait_s: int = 300,
    ):
        super().__init__(
            session_id=session_id,
            node_name=node_name,
            stop_event=stop_event,
            input_map=input_map,
            output_variable_path=output_variable_path,
        )
        self.python_code_executor_service = python_code_executor_service
        self.graph_id = graph_id
        self.llm_config_id = llm_config_id
        self.agent_mode = agent_mode
        self.system_prompt = system_prompt
        self.stream_handler_code = stream_handler_code
        self.libraries = libraries or []
        self._pending_handler_task = None
        self._handler_state = {}
        self.polling_interval_ms = polling_interval_ms
        self.silence_indicator_s = silence_indicator_s
        self.indicator_repeat_s = indicator_repeat_s
        self.chunk_timeout_s = chunk_timeout_s
        self.inactivity_timeout_s = inactivity_timeout_s
        self.max_wait_s = max_wait_s

    # ------------------------------------------------------------------
    # OpenCode HTTP helpers
    # ------------------------------------------------------------------

    def _get_instance_port(self) -> int:
        """Get or create an OpenCode instance for this LLM config via Instance Manager."""
        url = f"{CODE_CONTAINER_URL}/instance/{self.llm_config_id}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        return data["port"]

    def _oc_get(self, port: int, path: str, timeout: int = 10):
        url = f"http://code:{port}{path}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
        return json.loads(raw) if raw.strip() else None

    def _oc_post(self, port: int, path: str, data: dict, timeout: int = 300):
        url = f"http://code:{port}{path}"
        body = json.dumps(data).encode()
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
            return json.loads(raw) if raw.strip() else None
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            logger.error(f"[CodeAgentNode] POST {url} → {e.code}: {error_body[:500]}")
            raise

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def _get_or_create_session(self, port: int, chat_id: str) -> tuple[str, bool]:
        """Find or create an OpenCode session keyed by chat_id.
        Returns (session_id, is_new)."""
        title = f"epicstaff_ca_{chat_id}"
        sessions = self._oc_get(port, "/session") or []
        for s in sessions:
            if s.get("title") == title:
                return s["id"], False
        result = self._oc_post(port, "/session", {"title": title})
        return result["id"], True

    # ------------------------------------------------------------------
    # Stream handler execution via sandbox
    # ------------------------------------------------------------------

    def _build_handler_code(self) -> str:
        """Build the complete Python code that wraps the user's stream handler.
        The wrapper returns the handler's return value so the node can capture
        persistent state (e.g. message IDs) across calls."""
        return f"""
{self.stream_handler_code}

def main(event_type=None, text=None, full_reply=None, context=None, **kwargs):
    context = context or {{}}
    result = None
    g = globals()
    if event_type == "start":
        if 'on_stream_start' in g:
            result = on_stream_start(context)
    elif event_type == "chunk":
        if 'on_chunk' in g:
            result = on_chunk(text, context)
    elif event_type == "complete":
        if 'on_complete' in g:
            result = on_complete(full_reply, context)
    return result if isinstance(result, dict) else {{}}
"""

    async def _call_handler(self, event_type: str, input_context: dict, bypass_stop=False, **kwargs):
        """Fire-and-forget: schedule the stream handler in the sandbox."""
        if not self.stream_handler_code:
            return

        async def _run():
            try:
                libs_hash = hashlib.sha256("|".join(sorted(self.libraries)).encode()).hexdigest()[:16]
                venv_name = f"ca_{libs_hash}" if self.libraries else "default"
                code_data = PythonCodeData(
                    venv_name=venv_name,
                    code=self._build_handler_code(),
                    libraries=self.libraries,
                    entrypoint="main",
                )
                ctx = {**input_context, **self._handler_state}
                func_kwargs = {"event_type": event_type, "context": ctx, **kwargs}
                result = await self.python_code_executor_service.run_code(
                    code_data, func_kwargs, stop_event=None if bypass_stop else self.stop_event,
                )
                if isinstance(result, dict) and result.get("result_data"):
                    try:
                        handler_return = json.loads(result["result_data"])
                        if isinstance(handler_return, dict):
                            self._handler_state.update(handler_return)
                    except (json.JSONDecodeError, TypeError):
                        pass
            except Exception as e:
                logger.warning(f"[CodeAgentNode] Stream handler error ({event_type}): {e}")

        prev = self._pending_handler_task

        async def _chained():
            if prev and not prev.done():
                await prev
            await _run()

        self._pending_handler_task = asyncio.create_task(_chained())

    # ------------------------------------------------------------------
    # Polling & streaming
    # ------------------------------------------------------------------

    def _parse_response(self, messages: list) -> tuple[str, str | None, list]:
        """Extract reasoning, final answer, and tool calls from assistant messages.
        Returns (reasoning_text, final_answer, tool_calls).
        reasoning_text updates progressively; final_answer is None until the
        text part appears (meaning OpenCode finished generating).
        tool_calls is a list of dicts with name, input, output."""
        reasoning = ""
        final_answer = None
        tool_calls = []
        for msg in messages:
            role = msg.get("role") or msg.get("info", {}).get("role")
            if role == "user":
                continue
            if role != "assistant":
                continue
            for part in msg.get("parts", []):
                pt = part.get("type", "")
                if pt == "reasoning":
                    text = part.get("text", "") or ""
                    if text:
                        reasoning = text
                elif pt == "text":
                    t = part.get("text", "")
                    if t:
                        final_answer = t
                elif pt == "tool":
                    tool_calls.append({
                        "name": part.get("name", "tool"),
                        "input": part.get("input", ""),
                        "output": part.get("output", ""),
                        "state": part.get("state", ""),
                    })
        return reasoning, final_answer, tool_calls

    def _format_thinking_text(self, reasoning: str, tool_calls: list) -> str:
        """Combine reasoning and tool call summaries into a single text
        suitable for the thinking bubble."""
        parts = []
        if reasoning:
            parts.append(reasoning)
        for tc in tool_calls:
            name = tc.get("name", "tool")
            inp = tc.get("input", "")
            state = tc.get("state", "")
            label = f"[{name}]" if not state or state == "completed" else f"[{name} ({state})]"
            if inp:
                # Truncate long inputs for the thinking bubble
                inp_preview = inp if len(inp) <= 200 else inp[:200] + "..."
                parts.append(f"{label} {inp_preview}")
            else:
                parts.append(label)
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Main execute
    # ------------------------------------------------------------------

    async def execute(
        self, state: State, writer: StreamWriter, execution_order: int, input_: Any
    ):
        self.stop_event.check_stop()

        if not self.llm_config_id:
            raise ValueError("CodeAgentNode requires an LLM config")

        prompt = input_.get("prompt") or input_.get("message") or ""
        if not prompt:
            raise ValueError("CodeAgentNode requires a 'prompt' in input_map")

        chat_id = input_.get("chat_id") or input_.get("session_id") or f"session_{self.session_id}"

        # Get OpenCode instance
        port = self._get_instance_port()
        oc_session_id, is_new_session = self._get_or_create_session(port, chat_id)

        # Extract model info from instance manager response
        instance_info = self._oc_get(int(CODE_CONTAINER_URL.split(":")[-1]), f"/instance/{self.llm_config_id}")
        provider = instance_info.get("provider", "openai") if instance_info else "openai"
        model = instance_info.get("model", "gpt-4o") if instance_info else "gpt-4o"

        # Build input context early so it's available in cleanup
        input_context = dict(input_)
        input_context["session_id"] = oc_session_id
        input_context["node_name"] = self.node_name

        try:
            return await self._run_agent_loop(
                state, writer, execution_order, input_, input_context,
                port, oc_session_id, is_new_session, provider, model, prompt,
            )
        except StopSession:
            logger.info("[CodeAgentNode] Session stopped — running cleanup")
            await self._cleanup_on_stop(input_context, port, oc_session_id)
            raise

    async def _cleanup_on_stop(self, input_context: dict, port: int, oc_session_id: str):
        """Abort OpenCode task, cancel handler tasks, update GChat bubble, stop instance if last user."""
        # Abort the OpenCode agent task so it stops generating
        try:
            self._oc_post(port, f"/session/{oc_session_id}/abort", {}, timeout=5)
            logger.info(f"[CodeAgentNode] Aborted OpenCode session {oc_session_id}")
        except Exception as e:
            logger.warning(f"[CodeAgentNode] Could not abort OpenCode session: {e}")

        # Cancel any in-flight handler task
        if self._pending_handler_task and not self._pending_handler_task.done():
            self._pending_handler_task.cancel()
            try:
                await self._pending_handler_task
            except (asyncio.CancelledError, Exception):
                pass

        # Update the GChat bubble (or create one) with a stopped message
        try:
            self._pending_handler_task = None
            await self._call_handler(
                "complete", input_context, bypass_stop=True, full_reply="⏹ Session stopped."
            )
            # Give the fire-and-forget task a moment to execute
            if self._pending_handler_task:
                await asyncio.wait_for(self._pending_handler_task, timeout=5)
        except Exception as e:
            logger.warning(f"[CodeAgentNode] Cleanup handler error: {e}")

        # Note: we intentionally do NOT stop the OpenCode instance here.
        # The session persists so the next message reuses it instantly.
        # The idle reaper (CODE_IDLE_TIMEOUT) handles unused instances.

    async def _run_agent_loop(
        self, state, writer, execution_order, input_, input_context,
        port, oc_session_id, is_new_session, provider, model, prompt,
    ):
        """Core agent loop — extracted so execute() can wrap it with stop cleanup."""
        # Call on_stream_start
        await self._call_handler("start", input_context)

        # Prepend system prompt + runtime context on first message in a new session
        full_prompt = prompt
        if is_new_session:
            runtime_ctx = (
                f"[Runtime context] You are running inside EpicStaff as Code Agent node "
                f"'{self.node_name}' in flow/graph {self.graph_id}. "
                f"Never trigger flow {self.graph_id} — that would create a recursive loop. "
                f"When listing sessions, your own is the most recent active session for flow {self.graph_id}."
            )
            parts = [runtime_ctx]
            if self.system_prompt:
                parts.append(self.system_prompt)
            parts.append(prompt)
            full_prompt = "\n\n".join(parts)

        # Snapshot message count BEFORE posting (needed for polling baseline)
        baseline_count = 0 if is_new_session else len(self._oc_get(port, f"/session/{oc_session_id}/message") or [])

        # Send prompt to OpenCode in background thread so polling starts immediately
        post_error = [None]
        def _bg_post():
            try:
                self._oc_post(port, f"/session/{oc_session_id}/message", {
                    "agent": self.agent_mode,
                    "model": {"providerID": provider, "modelID": model},
                    "parts": [{"type": "text", "text": full_prompt}],
                })
            except Exception as e:
                post_error[0] = e
                logger.error(f"[CodeAgentNode] Failed to send message: {e}")
        post_thread = threading.Thread(target=_bg_post, daemon=True)
        post_thread.start()

        # Poll for response
        poll_s = self.polling_interval_ms / 1000.0
        last_reasoning = ""
        final_answer = None
        last_content_time = time.time()
        start_time = time.time()
        silence_indicator_sent = 0
        logged_first = False
        prev_msg_count = 0

        fast_poll_s = poll_s / 10
        while True:
            self.stop_event.check_stop()
            await asyncio.sleep(fast_poll_s)
            elapsed = time.time() - start_time

            if elapsed > self.max_wait_s:
                logger.warning(f"[CodeAgentNode] Max wait exceeded ({self.max_wait_s}s)")
                break

            # Check if POST failed
            if post_error[0] is not None:
                logger.error(f"[CodeAgentNode] POST failed: {post_error[0]}")
                break

            # Check OpenCode session status (busy vs idle)
            oc_busy = False
            try:
                statuses = self._oc_get(port, "/session/status") or {}
                if statuses:
                    s = statuses.get(oc_session_id, {})
                    oc_busy = s.get("type") not in (None, "idle", "error", "failed", "cancelled")
                    is_idle = not oc_busy and (oc_session_id not in statuses or s.get("type") in ("idle", "error", "failed", "cancelled"))
                else:
                    is_idle = True
            except Exception:
                is_idle = False

            try:
                msgs = self._oc_get(port, f"/session/{oc_session_id}/message") or []
            except Exception:
                continue

            new_msgs = msgs[baseline_count:]
            cur_msg_count = len(new_msgs)

            # Any new message (user or assistant) resets the activity timer
            if cur_msg_count > prev_msg_count:
                last_content_time = time.time()
                prev_msg_count = cur_msg_count

            if new_msgs and not logged_first:
                logged_first = True

            reasoning, answer, tool_calls = self._parse_response(new_msgs)

            # Tool activity resets the content timer
            if tool_calls:
                last_content_time = time.time()

            # Build thinking text: reasoning + tool call summaries
            thinking_text = self._format_thinking_text(reasoning, tool_calls)

            # Stream progress when content changes
            if thinking_text and thinking_text != last_reasoning:
                last_reasoning = thinking_text
                last_content_time = time.time()
                silence_indicator_sent = 0

                self.custom_session_message_writer.add_custom_message(
                    session_id=self.session_id,
                    node_name=self.node_name,
                    writer=writer,
                    execution_order=execution_order,
                    message_data={
                        "message_type": "code_agent_stream",
                        "text": thinking_text,
                        "tool_calls": tool_calls,
                        "is_final": False,
                    },
                )

                await self._call_handler("chunk", input_context, text=thinking_text)

            # Final answer appeared → done
            if answer:
                final_answer = answer
                logger.info("[CodeAgentNode] Final answer received")
                break

            # OpenCode idle → grab final content and exit
            if is_idle and logged_first:
                msgs = self._oc_get(port, f"/session/{oc_session_id}/message") or []
                _, final_answer, _ = self._parse_response(msgs[baseline_count:])
                logger.info("[CodeAgentNode] OpenCode session idle, completing")
                break

            # Timeout checks — only when OpenCode is NOT busy
            silence = time.time() - last_content_time
            if not oc_busy:
                if not logged_first and silence > self.chunk_timeout_s:
                    logger.warning(f"[CodeAgentNode] Chunk timeout ({self.chunk_timeout_s}s) — no response started")
                    break
                if logged_first and not reasoning and silence > self.inactivity_timeout_s:
                    logger.warning(f"[CodeAgentNode] Inactivity timeout ({self.inactivity_timeout_s}s)")
                    break

            # Silence indicator dots
            if silence > self.silence_indicator_s and last_reasoning:
                dots_due = int((silence - self.silence_indicator_s) / self.indicator_repeat_s) + 1
                if dots_due > silence_indicator_sent:
                    silence_indicator_sent = dots_due
                    dotted_text = last_reasoning + "..." * dots_due
                    await self._call_handler("chunk", input_context, text=dotted_text)

        # Use final_answer if available, else fall back to last reasoning
        reply_text = final_answer or last_reasoning or ""

        # Stream final message
        self.custom_session_message_writer.add_custom_message(
            session_id=self.session_id,
            node_name=self.node_name,
            writer=writer,
            execution_order=execution_order,
            message_data={
                "message_type": "code_agent_stream",
                "text": reply_text,
                "is_final": True,
            },
        )

        # Call on_complete
        await self._call_handler("complete", input_context, full_reply=reply_text)

        return {
            "reply": reply_text,
            "session_id": oc_session_id,
        }
