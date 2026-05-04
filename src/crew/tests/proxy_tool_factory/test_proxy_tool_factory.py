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

def test_args_schema_hides_mixed_when_user_value_provided():
    # mixed + значение в global_kwargs → агент не видит (user input wins)
    variables = [
        {"name": "query",   "type": "string",  "input_type": "agent_input", "required": True,  "default_value": None},
        {"name": "api_key", "type": "string",  "input_type": "user_input",  "required": True,  "default_value": None},
        {"name": "limit",   "type": "integer", "input_type": "mixed",       "required": False, "default_value": 10},
    ]
    schema = _build_args_schema(variables, global_kwargs={"limit": 10})

    assert "query" in schema["properties"]
    assert "api_key" not in schema["properties"]   # user_input скрыт
    assert "limit" not in schema["properties"]     # mixed с user-значением скрыт
    assert "query" in schema["required"]


def test_args_schema_exposes_mixed_as_required_when_no_user_value():
    # mixed + нет значения в global_kwargs → агент должен предоставить (required)
    variables = [
        {"name": "query", "type": "string",  "input_type": "agent_input", "required": True, "default_value": None},
        {"name": "limit", "type": "integer", "input_type": "mixed",       "required": False, "default_value": None},
    ]
    schema = _build_args_schema(variables, global_kwargs={})

    assert "limit" in schema["properties"]
    assert "limit" in schema["required"]           # нет дефолта — агент обязан передать


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


def test_mixed_without_user_value_is_required_and_passed_by_agent():
    # mixed без user-значения → агент видит и передаёт, попадает в sandbox
    variables = [
        {"name": "limit", "type": "integer", "input_type": "mixed", "required": False, "default_value": None},
    ]
    with run_tool_ctx(variables, global_kwargs={}, run_code_return=SUCCESS_RESULT) as (tool, captured):
        tool.run(limit=42)

    assert captured["inputs"]["limit"] == 42


def test_mixed_with_user_value_is_used_from_global_kwargs():
    # mixed с user-значением → агент не видит, значение приходит из global_kwargs
    variables = [
        {"name": "limit", "type": "integer", "input_type": "mixed", "required": False, "default_value": 10},
    ]
    with run_tool_ctx(variables, global_kwargs={"limit": 10}, run_code_return=SUCCESS_RESULT) as (tool, captured):
        tool.run()  # агент ничего не передаёт — limit не в schema

    assert captured["inputs"]["limit"] == 10
