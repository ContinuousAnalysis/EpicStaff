import pytest
from domain.models.realtime_tool import RealtimeTool, ToolParameters


@pytest.fixture
def empty_params():
    return ToolParameters(properties={})


# ---------------------------------------------------------------------------
# ToolParameters
# ---------------------------------------------------------------------------


def test_parameters_default_type_is_object(empty_params):
    assert empty_params.type == "object"


def test_parameters_required_defaults_to_empty(empty_params):
    assert empty_params.required == []


def test_parameters_custom_properties():
    params = ToolParameters(
        properties={"query": {"type": "string"}},
        required=["query"],
    )
    assert "query" in params.properties
    assert params.required == ["query"]


# ---------------------------------------------------------------------------
# RealtimeTool
# ---------------------------------------------------------------------------


def test_realtime_tool_default_type_is_function(empty_params):
    tool = RealtimeTool(name="my_tool", parameters=empty_params)
    assert tool.type == "function"


def test_short_description_preserved(empty_params):
    tool = RealtimeTool(name="t", parameters=empty_params)
    tool.description = "short description"
    assert tool.description == "short description"


def test_empty_description(empty_params):
    tool = RealtimeTool(name="t", parameters=empty_params)
    tool.description = ""
    assert tool.description == ""


def test_exactly_1024_chars_not_truncated(empty_params):
    text = "a" * 1024
    tool = RealtimeTool(name="t", parameters=empty_params)
    tool.description = text
    assert tool.description == text
    assert not tool.description.endswith("...")


def test_long_description_truncated_with_ellipsis(empty_params):
    text = "b" * 1025
    tool = RealtimeTool(name="t", parameters=empty_params)
    tool.description = text
    assert tool.description.endswith("...")
    assert len(tool.description) == 1024


def test_very_long_description_truncated(empty_params):
    text = "x" * 5000
    tool = RealtimeTool(name="t", parameters=empty_params)
    tool.description = text
    assert len(tool.description) == 1024
    assert tool.description.endswith("...")
