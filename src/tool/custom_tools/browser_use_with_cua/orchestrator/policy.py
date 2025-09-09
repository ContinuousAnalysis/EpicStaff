from typing import Literal, Tuple, Dict, Any

Tool = Literal["browser","computer"]

def choose_tool(step: Dict[str, Any]) -> Tuple[Tool, str]:
    action = step.get("action")
    target_kind = step.get("target_kind","unknown")
    risk = step.get("risk","med")

    if action in ("navigate","type","submit","wait","assert"):
        return "browser","non-click action"

    if action != "click":
        return "browser","default"

    if target_kind == "icon" or risk in ("high","med"):
        return "computer", f"risky click: kind={target_kind}, risk={risk}"

    return "browser", f"safe click: kind={target_kind}, risk={risk}"