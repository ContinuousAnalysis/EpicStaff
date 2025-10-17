import os
import argparse
import time
from fastmcp import FastMCP
import interpreter
from loguru import logger


parser = argparse.ArgumentParser()
parser.add_argument("--host", type=str, default="0.0.0.0")
parser.add_argument("--port", type=int, default=int(os.getenv("PORT", 7001)))
args = parser.parse_args()

logger.info(f"Confirming environment -> DISPLAY is set to: {os.getenv('DISPLAY')}")

HOST = args.host
PORT = args.port

API_KEY = os.getenv("API_KEY")
LLM = os.getenv("LLM_MODEL", "gpt-4o")
TIMEOUT = int(os.getenv("MCP_OPEN_INTERPRETER_TIMEOUT_SECONDS", 300))

logger.info(f"Using model {LLM}")

local_interpreter = interpreter.OpenInterpreter()

local_interpreter.llm.api_key = API_KEY
local_interpreter.llm.model = LLM
local_interpreter.llm_supports_vision = True

local_interpreter.display = True
local_interpreter.stream = True

local_interpreter.computer.import_computer_api = True
local_interpreter.computer.emit_images = True

local_interpreter.auto_run = True
local_interpreter.safe_mode = False
local_interpreter.offline = False
local_interpreter.verbose = True
local_interpreter.max_output = 2000

custom_instruction = """
IMPORTANT RULE: My environment has a known issue where your internal computer.display.screenshot() function will hang and fail.
You MUST NOT use that function.
To take a screenshot, you MUST ALWAYS use the reliable shell command 'scrot'.
For example: `scrot my_screenshot.png`
IMPORTANT RULE: Your container has GUI via Xcfb and VNC. You can freely use it.
"""

local_interpreter.system_message += custom_instruction

logger.info("Persistent Open Interpreter initialized.")

if not API_KEY:
    raise RuntimeError(
        "API_KEY environment variable is not set. "
        "The OpenInterpreter tool requires a valid API key to function."
    )

# Initialize MCP server
mcp = FastMCP("OpenInterpreterTool")


@mcp.tool()
def open_interpreter(instruction: str):
    try:
        logger.info(f"Received instruction: {instruction}")
        start_time = time.time()
        output = ""
        errors = []

        # Execute chat incrementally
        for chunk in local_interpreter.chat(instruction):
            if isinstance(chunk, dict):
                if chunk.get("type") == "code":
                    output += chunk.get("content", "")
                elif chunk.get("type") in ["console", "message"]:
                    output += chunk.get("content", "")

            if time.time() - start_time > TIMEOUT:
                errors.append(
                    f"Execution exceeded {TIMEOUT}s and stopped before finishing all commands."
                )
                break

        return {
            "success": True,
            "output": output.strip(),
            "errors": errors,
        }

    except Exception as e:
        logger.error(f"Execution failed: {e}")
        return {
            "success": False,
            "output": None,
            "errors": [str(e)],
        }


if __name__ == "__main__":
    logger.info(f"Starting OpenInterpreterTool server on http://0.0.0.0:{PORT}")

    mcp.run(transport="http", host=HOST, port=PORT, stateless_http=True)
