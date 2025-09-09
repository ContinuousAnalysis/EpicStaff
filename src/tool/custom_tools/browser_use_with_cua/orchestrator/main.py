import asyncio
import os
import json
import uuid

from orchestrator.hub import Hub
from orchestrator.planner import plan_steps
from orchestrator.runner import run_steps 
from orchestrator.prompt import PROMPT

from dotenv import load_dotenv
load_dotenv()

os.environ.setdefault("RUNS_DIR", "./runs")
MCP_URL = os.getenv("MCP_URL", "http://127.0.0.1:8080/mcp")
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
TEMP = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.0"))

SESSION_ID = str(uuid.uuid4())

def to_jsonable(obj):
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, list):
        return [to_jsonable(item) for item in obj]
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    return obj

async def amain(full_prompt: str):
    steps = plan_steps(full_prompt)
    print(f"[planner] steps: {len(steps)}")
    hub = Hub(MCP_URL, timeout=600.0, session_id=SESSION_ID)
    await hub.ainit()
    try:
        result = await run_steps(hub, steps, MODEL, TEMP, env="local", user_context=full_prompt)
        return result
    finally:
        await hub.aclose()

if __name__ == "__main__":
    out = asyncio.run(amain(PROMPT))
    print(json.dumps(to_jsonable(out), ensure_ascii=False, indent=2))