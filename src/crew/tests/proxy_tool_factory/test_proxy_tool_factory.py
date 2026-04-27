import asyncio
from concurrent.futures import Future as ConcurrentFuture
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from src.crew.services.crew.proxy_tool_factory import ProxyToolFactory, _build_args_schema
from src.crew.services.graph.events import StopEvent
from src.shared.models import PythonCodeData, PythonCodeToolData


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def make_tool_data(variables, global_kwargs=None):
    return PythonCodeToolData(
        id=1,
        name="my_tool",
        description="desc",
        variables=variables,
        python_code=PythonCodeData(
            venv_name="default",
            code="def main(**kw): return str(kw)",
            entrypoint="main",
            libraries=[],
            global_kwargs=global_kwargs or {},
        ),
    )


@contextmanager
def run_tool_ctx(variables, global_kwargs, run_code_return):
    """
    Создаёт тул с variables/global_kwargs, подменяет asyncio.run_coroutine_threadsafe
    чтобы не нужен был живой event loop, и возвращает (tool, captured_inputs).
    captured_inputs заполняется при вызове tool.run().
    """
    captured = {}

    async def fake_run_code(python_code_data, inputs, additional_global_kwargs, stop_event):
        captured["inputs"] = inputs
        return run_code_return

    mock_executor = MagicMock()
    mock_executor.run_code = fake_run_code

    factory = ProxyToolFactory(
        host="127.0.0.1",
        port=8001,
        python_code_executor_service=mock_executor,
    )
    tool = factory.create_python_code_proxy_tool(
        python_code_tool_data=make_tool_data(variables, global_kwargs),
        global_kwargs={},
        stop_event=MagicMock(spec=StopEvent),
    )

    def fake_run_coroutine_threadsafe(coro, loop):
        fut = ConcurrentFuture()
        fut.set_result(asyncio.new_event_loop().run_until_complete(coro))
        return fut

    with patch(
        "src.crew.services.crew.proxy_tool_factory.asyncio.run_coroutine_threadsafe",
        side_effect=fake_run_coroutine_threadsafe,
    ):
        yield tool, captured


# ---------------------------------------------------------------------------
# args_schema — unit (без event loop)
# ---------------------------------------------------------------------------

def test_args_schema_exposes_only_agent_and_mixed():
    variables = [
        {"name": "query",   "type": "string",  "input_type": "agent_input", "required": True,  "default_value": None},
        {"name": "api_key", "type": "string",  "input_type": "user_input",  "required": True,  "default_value": None},
        {"name": "limit",   "type": "integer", "input_type": "mixed",       "required": False, "default_value": 10},
    ]
    schema = _build_args_schema(variables)

    assert "query" in schema["properties"]
    assert "limit" in schema["properties"]
    assert "api_key" not in schema["properties"]   # user_input не видна агенту
    assert "query" in schema["required"]
    assert "limit" not in schema["required"]        # mixed — не required


# ---------------------------------------------------------------------------
# tool._run → sandbox
# ---------------------------------------------------------------------------

VARIABLES = [
    {"name": "query",   "type": "string", "input_type": "agent_input", "required": True,  "default_value": None},
    {"name": "api_key", "type": "string", "input_type": "user_input",  "required": True,  "default_value": None},
]

SUCCESS_RESULT = {"returncode": 0, "result_data": "Paris", "stderr": "", "stdout": "", "execution_id": "x"}
FAILURE_RESULT = {"returncode": 1, "result_data": None,    "stderr": "NameError: foo", "stdout": "", "execution_id": "x"}


def test_tool_run_passes_agent_and_user_input_kwargs_to_sandbox():
    with run_tool_ctx(VARIABLES, global_kwargs={"api_key": "secret123"}, run_code_return=SUCCESS_RESULT) as (tool, captured):
        tool.run(query="capital of France")

    assert captured["inputs"]["query"] == "capital of France"
    assert captured["inputs"]["api_key"] == "secret123"


def test_tool_run_returns_result_data_on_success():
    with run_tool_ctx(VARIABLES, global_kwargs={"api_key": "k"}, run_code_return=SUCCESS_RESULT) as (tool, _):
        result = tool.run(query="q")

    assert result == "Paris"


def test_tool_run_returns_stderr_on_failure():
    with run_tool_ctx(VARIABLES, global_kwargs={"api_key": "k"}, run_code_return=FAILURE_RESULT) as (tool, _):
        result = tool.run(query="q")

    assert result == "NameError: foo"


def test_agent_kwargs_override_global_kwargs_for_mixed_variable():
    variables = [
        {"name": "limit", "type": "integer", "input_type": "mixed", "required": False, "default_value": 10},
    ]
    # converter уже положил дефолт в global_kwargs
    with run_tool_ctx(variables, global_kwargs={"limit": 10}, run_code_return=SUCCESS_RESULT) as (tool, captured):
        tool.run(limit=99)

    assert captured["inputs"]["limit"] == 99
