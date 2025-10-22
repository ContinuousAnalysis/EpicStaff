import os
import argparse
import time
from fastmcp import FastMCP
import interpreter
from loguru import logger
import json

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


@mcp.tool(name="cli_tool")
def cli_tool(instruction: str):
    try:

        stateless_interpreter = interpreter.OpenInterpreter()

        stateless_interpreter.llm.api_key = API_KEY
        stateless_interpreter.llm.model = LLM
        stateless_interpreter.llm_supports_vision = False

        stateless_interpreter.display = False
        stateless_interpreter.stream = True

        stateless_interpreter.computer.import_computer_api = False

        stateless_interpreter.auto_run = True
        stateless_interpreter.safe_mode = False
        stateless_interpreter.offline = False
        stateless_interpreter.verbose = False
        stateless_interpreter.max_output = 2000

        custom_instruction = """
        CRITICAL RULE:
        1. After all commands are executed, provide a final summary of the prompt in the following format:

        [result]
        <final answer here>

        2. Do not include any extra text outside this format.
        3. If request is illogical, and can't be completed, message about this should also start from [result]
        IMPORTANT RULES FOR CLI TOOL:
        1. Your only job is to execute CLI commands inside the container
        2. If user doesn't specify directory to run commands, use app/
        3. Never access any system files outside app/ directory, unless user specifically asks
        4. Never attempt GUI operations
        5. Always handle errors gracefully and return stdout, stderr and exit code.
        6. You don't have access to sudo, so don't use it
        """

        stateless_interpreter.system_message += custom_instruction

        logger.info("Local Open Interpreter initialized.")
        stateless_interpreter.reset()
        logger.info(f"Received instruction: {instruction}")
        start_time = time.time()

        overall_output = ""
        commands = []
        errors = []
        exit_code = 0
        current_code_block = None
        current_output = []
        start_time = time.time()
        result_section = ""
        result_mode = False

        for chunk in stateless_interpreter.chat(instruction):
            if time.time() - start_time > TIMEOUT:
                errors.append(
                    f"Execution exceeded {TIMEOUT}s and stopped before finishing all commands."
                )
                exit_code = 1
                break

            ctype = chunk.get("type")
            content = chunk.get("content", "").strip()
            if not content:
                continue

            elif "[result]" in content:
                before, after = content.split("[result]", 1)

                if current_code_block:
                    current_output.append(before.strip())
                    output_text = "\n".join(current_output).strip()
                    commands.append(
                        {
                            "command": current_code_block,
                            "output": output_text,
                            "errors": [],
                        }
                    )
                    current_code_block = None
                    current_output = []

                result_section += after.strip() + "\n"
                result_mode = True
                continue

            elif result_mode:
                result_section += content + "\n"
                continue

            elif ctype == "code":
                if current_code_block:
                    output_text = "\n".join(current_output).strip()
                    commands.append(
                        {
                            "command": current_code_block,
                            "output": output_text,
                            "errors": [],
                        }
                    )
                    current_output = []
                current_code_block = content

            elif ctype in ["console", "message"]:
                current_output.append(content)

        if current_code_block:
            output_text = "\n".join(current_output).strip()
            commands.append(
                {"command": current_code_block, "output": output_text, "errors": []}
            )

        duration = time.time() - start_time

        final_result = {
            "success": exit_code == 0,
            "output": result_section.strip(),
            "commands": commands,
            "errors": errors,
            "exit_code": exit_code,
            "metadata": {"cwd": os.getcwd(), "duration_seconds": round(duration, 2)},
        }

    except Exception as e:
        logger.error(f"Execution failed: {e}")
        final_result = {
            "success": False,
            "output": overall_output.strip(),
            "commands": commands,
            "errors": [str(e)],
            "exit_code": 1,
            "metadata": {
                "cwd": os.getcwd(),
                "duration_seconds": round(time.time() - start_time, 2),
            },
        }

    logger.info(f"CLI Tool final output:\n{json.dumps(final_result, indent=2)}")

    return final_result


if __name__ == "__main__":
    logger.info(f"Starting OpenInterpreterTool server on http://0.0.0.0:{PORT}")

    mcp.run(transport="http", host=HOST, port=PORT, stateless_http=True)
