import os
import time
import json
import subprocess

from typing import Optional, List
from fastmcp import FastMCP
import interpreter
from loguru import logger
from pydantic import BaseModel, Field


HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", 7001))

API_KEY = os.getenv("API_KEY")
LLM = os.getenv("LLM_MODEL", "gpt-4o")
TIMEOUT = int(os.getenv("MCP_OPEN_INTERPRETER_TIMEOUT_SECONDS", 300))

logger.info(f"Using model {LLM}")

if not API_KEY:
    raise RuntimeError(
        "API_KEY environment variable is not set. "
        "The OpenInterpreter tool requires a valid API key to function."
    )

# Initialize MCP server
mcp = FastMCP("OpenInterpreterTool")


class BrowserToolInput(BaseModel):
    """
    Input schema for the browser automation tool.
    Expects a contextual description and a list of sequential natural language instructions.
    """

    context: Optional[str] = Field(
        None,
        description="High-level context or objective of the browser session (e.g., 'Check Python website functionality').",
    )

    instructions: List[str] = Field(
        ...,
        min_items=1,
        description="Ordered list of natural language instructions for browser actions.",
    )


@mcp.tool(name="browser_tool")
def browser_tool(input_data: BrowserToolInput):
    """
    Expects task in format:
    {
        "context": "useful info for the tool",
        "instructions": [
            "Open the browser",
            "Open Python's main page",
            "Open Downloads page",
            "Check if it's working as intended"
        ]
    }
    """
    forward_ports = [4200, 8000]
    for port in forward_ports:
        subprocess.Popen(
            [
                "socat",
                f"TCP-LISTEN:{port},fork",
                f"TCP:host.docker.internal:{port}",
            ]
        )

    local_interpreter = interpreter.OpenInterpreter()

    local_interpreter.llm.api_key = API_KEY
    local_interpreter.llm.model = LLM
    local_interpreter.llm_supports_vision = True

    local_interpreter.display = False
    local_interpreter.stream = True

    local_interpreter.auto_run = True
    local_interpreter.safe_mode = False
    local_interpreter.offline = False
    local_interpreter.verbose = True
    local_interpreter.max_output = 2000

    custom_instruction = """
        You are a browser automation agent running inside a secure Linux container
        with virtual display `:99` and noVNC monitoring. Your mission is to safely
        execute browser automation tasks using Python.

        Environment:
        - Display: Xvfb (:99)
        - Browser: Chromium + driver
        - Libraries: Playwright (Chromium), Selenium, requests, Pillow, OpenCV, pandas
        - System tools: scrot, x11vnc, GTK3, libx11, libgl1-mesa-glx, fonts, novnc, websockify
        - Async runtime: You are already inside an event loop. Do not use asyncio.run() or sync_playwright().
        - Image analysis: use only your model's vision capabilities unless explicitly instructed.

        Critical Rule:
        - After finishing a task, always end output with:
        [SUCCESS] <required output>  or  [FAILURE] <required output>
        - Include all extracted/read/output information in <required output>.
        - Do not omit this line. Do not use print() automatically.

        Behavior Guidelines:
        1. Do not close the browser unless instructed.
        2. Use:
            from browser_manager import start_browser
            browser, context, page = await start_browser()
            to start the browser, and
            from browser_manager import close_browser
            await close_browser()
            to close it.
        3. Retry each step up to 5 times if it fails; record error if still failing.
    """
    local_interpreter.system_message += custom_instruction
    logger.info("Local Open Interpreter initialized.")

    context = input_data.context
    instructions = input_data.instructions

    # context = input_data["context"]
    # instructions = input_data["instructions"]

    logger.info(f"Received task: context: {context}; instructions: {instructions}")
    start_time = time.time()

    steps_output = []
    step_counter = 1
    overall_success = True

    local_interpreter.system_message += f"Context of the task:\n{context}"

    for instruction in instructions:
        last_text = []
        step_summary = None
        step_success = False
        try:
            for chunk in local_interpreter.chat(instruction):
                ctype = chunk.get("type")
                content = chunk.get("content", "")

                if content:
                    if ctype in ("code", "console"):
                        last_text = []
                    elif ctype == "message":
                        last_text.append(content)

                    if "[SUCCESS]" in content:
                        step_success = True

                    elif "[FAILURE]" in content:
                        step_success = False

        except Exception as e:
            step_summary = f"[FAILURE] Exception: {str(e)}"
            step_success = False

        step_summary = "".join(last_text).strip()

        steps_output.append(
            {"step": step_counter, "success": step_success, "summary": step_summary}
        )
        if not step_success:
            overall_success = False
        step_counter += 1

    duration = round(time.time() - start_time, 2)
    result = {
        "steps": steps_output,
        "success": overall_success,
        "context": context,
        "duration_seconds": duration,
    }

    logger.info(
        f"Browser tool final output (agent-facing): {json.dumps(result, indent=2)}"
    )
    return result


if __name__ == "__main__":
    logger.info(f"Starting OpenInterpreterTool server on http://0.0.0.0:{PORT}")

    mcp.run(transport="http", host=HOST, port=PORT, stateless_http=True)
