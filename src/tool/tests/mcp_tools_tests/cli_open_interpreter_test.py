import os
import json
import pytest
import requests
from pathlib import Path

# --- Configuration ---
TESTS_DIR = Path(__file__).parent
TOOL_ROOT = TESTS_DIR.parent.parent / "mcp_tools" / "open_interpreter_tool"
SHARED_TESTFILE = "/home/folder/project/savefiles/pytest_output.txt"


TOOL_HOST = os.getenv("TOOL_HOST", "localhost")
TOOL_PORT = int(os.getenv("TOOL_PORT", 7001))
BASE_URL = f"http://{TOOL_HOST}:{TOOL_PORT}"
MCP_ENDPOINT = f"{BASE_URL}/mcp"


# --- Fixtures ---


@pytest.fixture
def headers():
    return {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }


@pytest.fixture
def endpoint():
    return MCP_ENDPOINT


# --- Helper Functions ---
def create_payload(
    command: str, tool_name: str = "cli_tool", context: str | None = None
) -> dict:
    input_data = {"command": command}
    if context is not None:
        input_data["context"] = context

    return {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": {"input_data": input_data},
        },
        "id": 1,
    }


def post_request(payload: dict, endpoint: str, headers: dict) -> requests.Response:
    return requests.post(endpoint, json=payload, headers=headers, timeout=60)


def parse_sse_response(response):
    """
    Parse SSE response from MCP/OpenInterpreter JSON-RPC output.
    Extracts the final result from 'structuredContent'.
    """
    data_lines = [
        line[len("data: ") :].strip()
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]

    if not data_lines:
        raise ValueError(f"No 'data:' lines found in response:\n{response.text}")

    # Parse the last event
    try:
        last_event = json.loads(data_lines[-1])
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON: {data_lines[-1]}\nError: {e}")

    # Extract 'structuredContent' where the actual result lives
    structured = last_event.get("result", {}).get("structuredContent")

    if structured:
        success = bool(structured.get("success", False))
        output_text = structured.get("output", "")
        errors = structured.get("errors", [])
        commands = []
        for cmd in structured.get("commands", []):
            commands.append(
                {
                    "command": cmd.get("command", ""),
                    "output": cmd.get("output", ""),
                    "errors": cmd.get("errors", []),
                }
            )
    else:
        # Fallback for error-only messages
        success = False
        output_text = ""
        commands = []
        errors = []
        # collect all 'text' entries from content
        content = last_event.get("result", {}).get("content", [])
        for c in content:
            text = c.get("text")
            if text:
                errors.append(text)

    return {
        "success": success,
        "output": output_text,
        "commands": commands,
        "errors": errors,
    }


# --- Tests --- #


# 1. Correct test
@pytest.mark.parametrize(
    "instruction,expected_output_substr",
    [("Using python calculate what is 125 divided by 5?", "25")],
)
def test_successful_code_execution(
    instruction, expected_output_substr, endpoint, headers
):
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert expected_output_substr in data["output"]
    assert "[result]" not in data["output"]

    assert isinstance(data["commands"], list)
    assert len(data["commands"]) >= 1


def test_successful_shell_command(endpoint, headers):
    payload = create_payload(
        "Do this steps one after another:"
        "1. Find in what directory your code is located"
        "2. List all files in this directory"
    )
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]

    assert "[result]" not in data["output"]
    assert "dockerfile" in data["output"].lower()

    assert isinstance(data["commands"], list)
    assert len(data["commands"]) >= 2

    last_cmd_output = data["commands"][-1]["output"]
    assert data["output"] not in last_cmd_output


# 2. AI Behavior Tests
def test_invalid_prompt(endpoint, headers):
    payload = create_payload("Divide 100 by 0.")
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]

    assert "[result]" not in data["output"]

    assert isinstance(data["commands"], list)
    assert not data["commands"]


# 3. Error Handling Tests
def test_invalid_tool_name(endpoint, headers):
    payload = create_payload("Any instruction", tool_name="non_existent_tool")
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert not data["success"]
    assert not data["commands"]
    assert any("Unknown tool" in e for e in data["errors"])


def test_missing_instruction_parameter(endpoint, headers):
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": "cli_tool", "arguments": {}},
        "id": 1,
    }
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert not data["success"]
    assert not data["commands"]
    assert any("required property" in e for e in data["errors"])


# 4. File Interaction Tests


def test_write_file(endpoint, headers):
    instruction = "Write 'This is a test output.' into the file at /app/data/pytest_output.txt(create the file if it doesn't exist)."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert "[result]" not in data["output"]


def test_read_file(endpoint, headers):
    instruction = "Read the file at /app/data/pytest_output.txt and output its content."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert "[result]" not in data["output"]
    assert "This is a test output." in data["output"]


def test_modify_existing_file(endpoint, headers):
    instruction = "Append ' -- Modified by OpenInterpreter' to the file at /app/data/pytest_output.txt."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert "[result]" not in data["output"]


def test_read_file_after_append(endpoint, headers):
    instruction = "Read the file at /app/data/pytest_output.txt and output its content."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert "[result]" not in data["output"]
    assert "This is a test output." in data["output"]
    assert "-- Modified by OpenInterpreter" in data["output"]


# Context Test
def test_interpreter_context(endpoint, headers):
    """
    Provide context to the interpreter (current folder: /app/)
    and ask it to list files. Check if the output respects context.
    """
    context = "We are currently located in the /app/ folder."
    instruction = "List all files in this folder."
    payload = create_payload(instruction, context=context)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    print(data)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert isinstance(data["commands"], list)

    assert (
        "dockerfile" in data["output"].lower()
        or "pyproject.toml" in data["output"].lower()
    )
