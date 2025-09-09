from typing import List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv
import os, json
from orchestrator.prompts import ORCHESTRATOR_SYSTEM_PROMPT

load_dotenv()
client = OpenAI()

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY")
PLANNER_MODEL   = os.getenv("PLANNER_MODEL", "gpt-4o-mini")

def plan_steps(user_prompt: str) -> List[Dict[str, Any]]:
    resp = client.chat.completions.create(
        model=PLANNER_MODEL,
        temperature=0.0,
        messages=[
            {"role": "system", "content": ORCHESTRATOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type":"json_object"},
    )
    data = resp.choices[0].message.content
    plan = json.loads(data)
    steps = plan.get("steps")
    if not isinstance(steps, list) or len(steps) == 0:
        raise RuntimeError(f"Planner returned no steps: {plan}")
    return steps