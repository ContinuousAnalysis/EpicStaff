import pytest
from unittest.mock import MagicMock
from domain.models.chat_mode import ChatMode
from domain.ports.i_chat_mode_controller import IChatModeController
from tool_executors.stop_agent_tool_executor import StopAgentToolExecutor
from domain.models.realtime_tool import RealtimeTool


@pytest.fixture
def controller():
    return MagicMock(spec=IChatModeController)


@pytest.fixture
def executor(controller):
    return StopAgentToolExecutor(
        stop_prompt="Call this tool to stop the conversation",
        chat_mode_controller=controller,
    )


@pytest.mark.asyncio
async def test_execute_sets_listen_mode(executor, controller):
    await executor.execute()
    controller.set_chat_mode.assert_called_once_with(ChatMode.LISTEN)


@pytest.mark.asyncio
async def test_get_realtime_tool_model_returns_realtime_tool(executor):
    tool = await executor.get_realtime_tool_model()
    assert isinstance(tool, RealtimeTool)


@pytest.mark.asyncio
async def test_get_realtime_tool_model_name(executor):
    tool = await executor.get_realtime_tool_model()
    assert tool.name == "stop_agent_tool"


@pytest.mark.asyncio
async def test_stop_prompt_used_as_description(controller):
    prompt = "Say goodbye to stop the agent"
    exec_ = StopAgentToolExecutor(stop_prompt=prompt, chat_mode_controller=controller)
    tool = await exec_.get_realtime_tool_model()
    assert tool.description == prompt


@pytest.mark.asyncio
async def test_long_stop_prompt_truncated(controller):
    long_prompt = "x" * 1025
    exec_ = StopAgentToolExecutor(stop_prompt=long_prompt, chat_mode_controller=controller)
    tool = await exec_.get_realtime_tool_model()
    assert len(tool.description) == 1024
    assert tool.description.endswith("...")


@pytest.mark.asyncio
async def test_execute_returns_none(executor):
    result = await executor.execute()
    assert result is None


@pytest.mark.asyncio
async def test_tool_has_no_required_parameters(executor):
    tool = await executor.get_realtime_tool_model()
    assert tool.parameters.required == []


@pytest.mark.asyncio
async def test_tool_has_no_properties(executor):
    tool = await executor.get_realtime_tool_model()
    assert tool.parameters.properties == {}
