import os
import asyncio
from typing import Any, Dict

from app_computer_use.test_computer_use import main as run_steps

async def run_computer_task(
    prompt: str,
    env: str | None = None,
    params: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    params = params or {}

    if env:
        os.environ["COMPUTER_ENV"] = env

    os.environ["ORCHESTRATOR_COMPUTER_PROMPT"] = "1"

    loop = asyncio.get_running_loop()
    state = await loop.run_in_executor(None, run_steps, prompt)

    return {
        "status": "ok",
        "env": os.getenv("COMPUTER_ENV", env or "docker"),
        "steps": state,
    }