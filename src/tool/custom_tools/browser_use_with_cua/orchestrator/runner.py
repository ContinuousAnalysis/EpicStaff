from typing import List, Dict, Any
import logging, os, time
from collections import defaultdict
from orchestrator.plan_tracker import PlanTracker
from orchestrator.policy import choose_tool

log = logging.getLogger("orchestrator")

def build_plan_ctx(steps: List[Dict[str, Any]], user_prompt: str) -> dict:
    return {
        "total_steps": len(steps),
        "user_prompt": user_prompt,
        "steps": steps,
    }

async def run_steps(hub,
                    steps: List[Dict[str, Any]],
                    model: str,
                    temperature: float,
                    env: str = "local",
                    user_context: str | None = None,
                    runs_dir: str | None = None):
    plan_ctx = build_plan_ctx(steps, user_prompt=user_context or "")
    tracker = PlanTracker(base_dir=runs_dir or os.getenv("RUNS_DIR"), session_id=hub.session_id)
    if not tracker.exists():
        tracker.init(user_prompt=user_context or "", steps=steps)

    total = len(steps)
    i = 1
    results: List[Dict[str, Any]] = []

    MAX_ATTEMPTS_PER_STEP = int(os.getenv("MAX_ATTEMPTS_PER_STEP", "8"))
    attempts = defaultdict(int)

    start_tool_env = os.getenv("START_TOOL")

    while 1 <= i <= total:
        step = steps[i - 1]
        attempts[i] += 1
        tool_hint, reason = choose_tool(step)
        tracker.update_step(i, tool=tool_hint, status="RUNNING",
                            notes=f"{reason}; attempt={attempts[i]}/{MAX_ATTEMPTS_PER_STEP}")

        try:
            print(f"[runner] calling run_step idx={i} attempt={attempts[i]} start_tool={start_tool_env if (i==1 and attempts[i]==1) else None}")

            res = await hub.run_step(
                step_idx=i,
                step=step,
                plan_ctx=plan_ctx,
                tool="auto",
                reset=(i == 1 and attempts[i] == 1),
                model=model,
                temperature=temperature,
                start_tool=(start_tool_env if (i == 1 and attempts[i] == 1) else None),
            )

            data = getattr(res, "structured_content", None) or getattr(res, "data", {}) or {}
            status = (data.get("status") or "").upper()  
            tool_used = data.get("tool_used", tool_hint)
            note = data.get("note") or data.get("error") or ""
            curr_tool = data.get("current_tool") or tool_used
            fail_streak = data.get("fail_streak")

            print(f"[runner] step={i} attempt={attempts[i]} tool_used={tool_used} status={status} curr_tool={curr_tool} streak={fail_streak} :: {(str(note)[:200] if note else '')}")

            if status == "PASSED":
                tracker.update_step(i, tool=tool_used, status="PASSED", notes=note)
                results.append({"step_idx": i, "tool": tool_used, "status": "PASSED", "note": (note or "")[:1000]})
                i += 1
                continue

            if status == "REWIND":
                tracker.update_step(i, tool=tool_used, status="REWIND", notes=note)
                results.append({"step_idx": i, "tool": tool_used, "status": "REWIND", "note": (note or "")[:1000]})
                i = max(1, i - 1)
                attempts[i] = 0 
                continue

            if attempts[i] < MAX_ATTEMPTS_PER_STEP:
                time.sleep(0.2)  
                continue

            tracker.update_step(i, tool=tool_used, status="FAILED", notes=f"(max attempts reached) {note}")
            results.append({"step_idx": i, "tool": tool_used, "status": "FAILED", "note": (note or "")[:1000]})
            break

        except Exception as e:
            tracker.update_step(i, tool=tool_hint, status="FAILED", notes=str(e))
            results.append({"step_idx": i, "tool": tool_hint, "status": "FAILED", "note": str(e)})
            break

    return {
        "total": total,
        "done": (i - 1 if 1 <= i - 1 <= total else 0),
        "results": results,
    }