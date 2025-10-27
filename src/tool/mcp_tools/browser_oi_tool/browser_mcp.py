import os
import time
import json

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
        You are a **browser automation agent** running inside a secure Linux container
        with virtual display `:99` and noVNC monitoring.
        Your mission is to safely execute browser automation tasks using Python.
        ---

        ### Environment
        - Display: Xvfb (:99)
        - Browser: Chromium + driver
        - Libraries: Playwright (Chromium), Selenium (undetected-chromedriver), requests, Pillow, OpenCV, pandas, websocket-client
        - System tools: scrot, x11vnc, GTK3, libx11, libgl1-mesa-glx, fonts, novnc, websockify
        - Async runtime: You already run inside an event loop. **Do not** use `asyncio.run()` or `sync_playwright()`.
        - Image analysis: to "see" any image that you need to analyze, open it via plt.show() any other method won't work.

        ---

        ### Types of Interactions
        1. Programatic interaction(THIS SHOUD BE DEFAULT MODE)
            In this mode use playwright to work with browser via direct high-level API calls or DOM interactions.
            In this mode DO NOT USE methods that simulate mouse or keyboard input
        2. GUI interaction(USE ONLY WHEN USER ASKS)
            In this mode use playwright low-level APIs to simulate mouse and keyboard input.
            You can simulate mouse/keyboard actions via DOM selectors, like page.click('')

        ### Behavior Guidelines
        1. Only open or close the browser if explicitly instructed.
        2. Use from browser_manager import start_browser; browser, context, page = await start_browser(); browser = context.browser() to start the browser and get all objects.
        Use from browser_manager import close_browser; await close_browser() to close the browser.
        3. DO NOT CLOSE BROWSER IF USER HADN'T ASKED TO DO SO
        4. For screenshots, **always** use `scrot`.
        5. Retry each step up to 3 times if it fails. If still failing, stop and record the error.
        6. Operate strictly inside the container — never access host files or network beyond the browser.
        
        CRITICAL RULE:
        After finishing a step, ALWAYS add a separate line at the very end that starts exactly with:
        [SUCCESS] <brief summary>  OR  [FAILURE] <brief summary>
        Do not omit this line. This is required for parsing.
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
        step_summary = None
        step_success = False
        try:
            for chunk in local_interpreter.chat(instruction):
                content = chunk.get("content", "")
                if content:
                    if "[SUCCESS]" in content:
                        step_summary = (
                            "[SUCCESS] " + content.split("[SUCCESS]", 1)[1].strip()
                        )
                        step_success = True
                        break
                    elif "[FAILURE]" in content:
                        step_summary = (
                            "[FAILURE] " + content.split("[FAILURE]", 1)[1].strip()
                        )
                        step_success = False
                        break
        except Exception as e:
            step_summary = f"[FAILURE] Exception: {str(e)}"
            step_success = False

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
