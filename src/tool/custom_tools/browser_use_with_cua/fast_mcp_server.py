import os
import re, json
from typing import Dict, Tuple, Optional
from fastmcp import FastMCP

from app_browser_use import run_browser_task
from app_computer_use import run_computer_task
from config import DEEPSEEK_API_KEY

mcp = FastMCP("custom_tools MCP Server")

_SESSIONS: Dict[str, Dict[str, object]] = {}

def _normalize_tool(name: Optional[str]) -> str:
    n = (name or "").strip().lower()
    return "computer" if n == "computer" else "browser"

def _get_session(session_id: str, start_tool: Optional[str] = None) -> Dict[str, object]:
    if session_id not in _SESSIONS:
        initial = _normalize_tool(start_tool or os.getenv("START_TOOL", "browser"))
        _SESSIONS[session_id] = {
            "current_tool": initial,
            "fail_streak": 0,
            "browser_started": False,
        }
    return _SESSIONS[session_id]

def _switch_tool(current: str) -> str:
    return "computer" if current == "browser" else "browser"

def _collect_strings(obj):
    if obj is None:
        return []
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        out = []
        for k in ("final", "status_text", "output", "text", "message", "content", "result"):
            if k in obj and isinstance(obj[k], str):
                out.append(obj[k])
        for v in obj.values():
            out.extend(_collect_strings(v))
        return out
    if isinstance(obj, (list, tuple)):
        out = []
        for v in obj:
            out.extend(_collect_strings(v))
        return out
    return [str(obj)]

def _stringify_output(obj) -> str:
    parts = _collect_strings(obj)
    raw = "\n".join(p for p in parts if p is not None)
    if not raw:
        try:
            raw = json.dumps(obj, ensure_ascii=False)
        except Exception:
            raw = str(obj)
    unescaped = (raw
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t"))
    return unescaped

def _parse_status(text: str) -> tuple[bool, str]:
    if not text:
        return False, "FAILED"
    matches = re.findall(r'(?mi)^\s*(PASSED|FAILED|REWIND)\s*$', text)
    if matches:
        s = matches[-1].upper()
        return (s == "PASSED"), s
    matches2 = re.findall(r'(?i)\b(PASSED|FAILED|REWIND)\b', text)
    if matches2:
        s = matches2[-1].upper()
        return (s == "PASSED"), s
    return False, "FAILED"

def _compose_server_prompt(plan: dict, step_idx: int) -> str:
    user_ctx = (plan.get("user_prompt") or "").strip()
    steps = plan.get("steps", [])
    total = plan.get("total_steps", len(steps))
    s = steps[step_idx - 1] if 0 <= step_idx - 1 < len(steps) else {}

    action = s.get("action", "unknown")
    target = s.get("target", "")
    sels   = s.get("selectors", [])
    hints  = s.get("hints", [])
    text   = s.get("text")
    expect = (s.get("constraints") or {}).get("expect") if s.get("constraints") else None

    lines = []
    lines.append("You are executing exactly one step from a multi-step plan using either a DOM browser or a desktop automation backend.")
    lines.append("Be precise and deterministic. Prefer explicit waits for selectors/URL; avoid fixed sleeps.")
    lines.append("Do NOT perform any actions beyond the current step. Do not explore.")
    lines.append("")
    lines.append("Terminal statuses (last line):")
    lines.append("- PASSED  (step succeeded)")
    lines.append("- FAILED  (step failed)")
    lines.append("- REWIND  (required UI elements/controls are missing or preconditions are not met; orchestrator will go back one step)")
    lines.append("")
    lines.append("Evidence:")
    lines.append("- If this is an assert step, first print:")
    lines.append("  EVIDENCE:")
    lines.append("  - <1–3 short bullet lines that prove the step, e.g., url=..., visible=..., selector_exists=...>")
    lines.append("")

    if user_ctx:
        lines.append("Global Context:")
        lines.append(user_ctx + "\n")

    lines.append("Full Plan (execute steps strictly in order):")
    for i, st in enumerate(steps, start=1):
        a = st.get("action", "unknown")
        t = st.get("target", "")
        g = st.get("goal") or f"Perform action: {a}"
        lines.append(f"- Step {i}: {a} → {t} | Goal: {g}")
    lines.append("")

    lines.append(f"### Execute ONLY Step {step_idx} / {total} now")
    lines.append(f"Action: {action}")
    lines.append(f"Target: {target}")
    if sels:  lines.append(f"Selectors: {sels}")
    if hints: lines.append(f"Hints: {hints}")
    if text:  lines.append(f"Text: {text}")

    lines.append("\nVerification hints:")
    if isinstance(expect, dict) and expect:
        if expect.get("url_contains"):
            lines.append(f"- url_contains: {expect['url_contains']}")
        tv = expect.get("text_visible")
        if tv:
            if isinstance(tv, list):
                for t in tv: lines.append(f"- text_visible: {t}")
            else:
                lines.append(f"- text_visible: {tv}")
        se = expect.get("selector_exists")
        if se:
            if isinstance(se, list):
                for sel in se: lines.append(f"- selector_exists: {sel}")
            else:
                lines.append(f"- selector_exists: {se}")
        ve = expect.get("value_equals")
        if isinstance(ve, dict) and ve.get("selector") and (ve.get("value") is not None):
            lines.append(f"- value_equals: selector={ve['selector']} value={ve['value']}")
    else:
        lines.append("- Provide one deterministic assertion (URL/text/selector/value) if this is an assert step.")

    lines.append("\nOutput rules:")
    lines.append("- Keep output minimal.")
    lines.append("- End with exactly one of: PASSED / FAILED / REWIND.")
    return "\n".join(lines)


@mcp.tool(description="(legacy) Browser tool")
async def run_browser(prompt: str, model: str = "deepseek-chat", temperature: float = 0.0,
                      session_id: str = "default", reset: bool = False):
    if not DEEPSEEK_API_KEY:
        return {"ok": False, "error": "DEEPSEEK_API_KEY not set"}
    try:
        result = await run_browser_task(
            prompt, model=model, temperature=temperature, session_id=session_id, reset=reset
        )
        return {"ok": True, "output": getattr(result, "output", None),
                "errors": result.errors() if hasattr(result, "errors") else None}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@mcp.tool(description="(legacy) Computer tool")
async def run_computer(prompt: str, env: str = "docker", params: dict | None = None):
    try:
        result = await run_computer_task(prompt=prompt, env=env, params=params)
        return {"ok": True, "output": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@mcp.tool(description="Execute one plan step; start tool by param/env and auto-switch after 3 consecutive FAILs")
async def run_step(session_id: str,
                   step_idx: int,
                   tool: str,              
                   step: dict,
                   plan: dict,
                   reset: bool = False,
                   allow_escalation: bool = True, 
                   model: str = "deepseek-chat",
                   temperature: float = 0.0,
                   start_tool: Optional[str] = None):
    
    if reset:
        _SESSIONS.pop(session_id, None)

    sess = _get_session(session_id, start_tool=start_tool)

    print(
        f"[server] sid={session_id[:8]} idx={step_idx} reset={reset} "
        f"start_tool_param={start_tool} env_START_TOOL={os.getenv('START_TOOL')} "
        f"current_tool={sess['current_tool']} fail_streak={sess['fail_streak']}"
    )

    chosen = sess["current_tool"]  
    server_prompt = _compose_server_prompt(plan, step_idx)

    ok = False
    status = "FAILED"
    note = ""
    tool_used = chosen

    if chosen == "browser":
        do_reset = bool(reset or not sess["browser_started"])
        try:
            if not DEEPSEEK_API_KEY:
                out_text = "DEEPSEEK_API_KEY not set\nFAILED"
            else:
                result = await run_browser_task(
                    server_prompt,
                    model=model,
                    temperature=temperature,
                    session_id=session_id,
                    reset=do_reset,
                )
                out_raw = getattr(result, "output", result)
                out_text = _stringify_output(out_raw).strip()

            ok, status = _parse_status(out_text)
            note = out_text
            tool_used = "browser"
            if ok:
                sess["browser_started"] = True

        except Exception as e:
            ok, status = False, "FAILED"
            note = f"browser exception: {e}"
            tool_used = "browser"

    else:
        try:
            os.environ["CUA_USE_LOCAL"] = "1"
            cresult = await run_computer_task(server_prompt, env="local", params={})
            ctext_raw = (cresult or {}).get("output")
            out_text = _stringify_output(ctext_raw).strip()
            ok, status = _parse_status(out_text)
            note = out_text
            tool_used = "computer"

        except Exception as e:
            ok, status = False, "FAILED"
            note = f"computer exception: {e}"
            tool_used = "computer"

    if status == "PASSED":
        sess["fail_streak"] = 0
    elif status == "REWIND":
        pass  
    else:  
        sess["fail_streak"] = int(sess["fail_streak"]) + 1
        if sess["fail_streak"] >= 3:
            old_tool = sess["current_tool"]
            new_tool = _switch_tool(old_tool)
            sess["current_tool"] = new_tool
            sess["fail_streak"] = 0
            note = (note or "") + f"\n[auto-switch] Switched tool: {old_tool} -> {new_tool} after 3 consecutive failures."

    print(
        f"[server] used={tool_used} status={status} next_current={sess['current_tool']} streak={sess['fail_streak']}"
    )

    return {
        "ok": bool(status == "PASSED"),
        "tool_used": tool_used,
        "status": status,  
        "note": note,
        "current_tool": sess["current_tool"],
        "fail_streak": sess["fail_streak"],
    }

if __name__ == "__main__":
    mcp.run(
        "streamable-http",
        host=os.getenv("FASTMCP_HOST", "0.0.0.0"),
        port=int(os.getenv("FASTMCP_PORT", "8080")),
    )
