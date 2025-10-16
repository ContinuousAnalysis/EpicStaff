import os
import json
import pytest
import requests
from pathlib import Path

# --- Configuration ---
TESTS_DIR = Path(__file__).parent
TOOL_ROOT = TESTS_DIR.parent.parent / "mcp_tools" / "open_interpreter_tool"
SHARED_DIR = TOOL_ROOT / "data" / "pytest_output.txt"


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
def create_payload(instruction: str, tool_name: str = "open_interpreter") -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": {"instruction": instruction}},
        "id": 1,
    }


def post_request(payload: dict, endpoint: str, headers: dict) -> requests.Response:
    return requests.post(endpoint, json=payload, headers=headers, timeout=60)


def parse_sse_response(response):
    data_lines = [
        json.loads(line[len("data: ") :].strip())
        for line in response.text.splitlines()
        if line.startswith("data:")
    ]
    if not data_lines:
        raise ValueError(f"No 'data:' lines found in response:\n{response.text}")

    last_event = data_lines[-1]
    result = last_event.get("result", {})

    if "structuredContent" in result:
        return result["structuredContent"]

    output_text = ""
    if "content" in result and isinstance(result["content"], list):
        output_text = "\n".join(item.get("text", "") for item in result["content"])

    return {
        "success": False,
        "output": output_text,
        "errors": [],
    }


# --- Tests --- #


# 1. Correct test
@pytest.mark.parametrize(
    "instruction,expected_output_substr",
    [("What is 125 divided by 5?", "25")],
)
def test_successful_code_execution(
    instruction, expected_output_substr, endpoint, headers
):
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert expected_output_substr in data["output"]
    assert not data["errors"]


def test_successful_shell_command(endpoint, headers):
    payload = create_payload(
        "List the files in the current directory using a shell command."
    )
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert "mcp" in data["output"].lower()
    assert not data["errors"]


# 2. AI Behavior Tests
@pytest.mark.parametrize(
    "instruction,expected_outputs",
    [
        (
            "Divide 100 by 0.",
            ["division by zero", "dividing by zero", "dividing a number by zero"],
        ),
        ("Run this python code: print('hello world')", ["hello world"]),
    ],
)
def test_ai_behavior(instruction, expected_outputs, endpoint, headers):
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]

    output_lower = data["output"].lower()
    assert any(phrase.lower() in output_lower for phrase in expected_outputs)


def test_vague_instruction(endpoint, headers):
    payload = create_payload("Just do something useful.")
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert data["output"] and len(data["output"].strip()) > 0


# 3. Error Handling Tests
def test_invalid_tool_name(endpoint, headers):
    payload = create_payload("Any instruction", tool_name="non_existent_tool")
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert not data["success"]
    assert "Unknown tool" in data["output"]


def test_missing_instruction_parameter(endpoint, headers):
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": "open_interpreter", "arguments": {}},
        "id": 1,
    }
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert not data["success"]
    assert "required property" in data["output"]


# 4. File Interaction Tests
SHARED_DIR = "./mcp_tools/open_interpreter_tool/data/pytest_output.txt"


def test_write_file(endpoint, headers):
    instruction = "Write 'This is a test output.' into the file at /app/data/pytest_output.txt(create the file if it doesn't exist)."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]

    with open(SHARED_DIR, "r") as f:
        content = f.read()
    assert "This is a test output." in content


def test_read_file(endpoint, headers):
    instruction = "Read the file at /app/data/pytest_output.txt and output its content."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]
    assert "This is a test output." in data["output"]


def test_modify_existing_file(endpoint, headers):
    instruction = "Append ' -- Modified by OpenInterpreter' to the file at /app/data/pytest_output.txt."
    payload = create_payload(instruction)
    response = post_request(payload, endpoint, headers)
    data = parse_sse_response(response)

    assert response.status_code == 200
    assert data["success"]
    assert not data["errors"]

    with open(SHARED_DIR, "r") as f:
        content = f.read()
    assert " -- Modified by OpenInterpreter" in content
