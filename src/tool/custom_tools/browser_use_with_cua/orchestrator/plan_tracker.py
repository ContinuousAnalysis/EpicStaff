import json, os, time, tempfile
from typing import List, Dict, Any
from filelock import FileLock

def _safe_mkdir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

class PlanTracker:
    def __init__(self, base_dir: str = None, session_id: str = "default"):
        base_dir = base_dir or os.getenv("RUNS_DIR", "./runs")
        self.dir = os.path.join(base_dir, session_id)
        self.plan_json = os.path.join(self.dir, "plan.json")
        self.plan_md   = os.path.join(self.dir, "plan.md")
        self.events    = os.path.join(self.dir, "events.ndjson")
        self.lockfile  = os.path.join(self.dir, ".plan.lock")
        _safe_mkdir(self.dir)
        self._lock = FileLock(self.lockfile)

    def exists(self) -> bool:
        return os.path.exists(self.plan_json)

    def init(self, user_prompt: str, steps: List[Dict[str, Any]]):
        state = {
            "created_at": time.time(),
            "user_prompt": user_prompt,
            "steps": [
                {
                    "idx": i + 1,
                    "tool": None,
                    "action": s.get("action"),
                    "target": s.get("target"),
                    "status": "PENDING",
                    "notes": ""
                } for i, s in enumerate(steps)
            ]
        }
        with self._lock:
            self._write_json_atomic(state)
            self._write_md_atomic(state)
            self._append_event_no_lock({"ts": time.time(), "idx": 0, "tool": "-", "status": "INIT", "notes": ""})

    def status(self, idx: int) -> str:
        with self._lock:
            st = self._read_json_no_lock()
            return st["steps"][idx - 1]["status"]

    def update_step(self, idx: int, tool: str, status: str, notes: str = ""):
        with self._lock:
            st = self._read_json_no_lock()
            if not st.get("steps"):
                st["steps"] = []
            if 0 <= idx - 1 < len(st["steps"]):
                step = st["steps"][idx - 1]
                step["tool"] = tool
                step["status"] = status
                if notes:
                    step["notes"] = notes
            else:
                pass

            self._write_json_atomic(st)
            self._write_md_atomic(st)
            self._append_event_no_lock({
                "ts": time.time(),
                "idx": idx,
                "tool": tool,
                "status": status,
                "notes": notes
            })


    def _read_json_no_lock(self) -> Dict[str, Any]:
        if not os.path.exists(self.plan_json):
            return {"steps": []}
        with open(self.plan_json, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write_json_atomic(self, obj: Dict[str, Any]) -> None:
        fd, tmp_path = tempfile.mkstemp(dir=self.dir, prefix="plan.", suffix=".json.tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(obj, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.plan_json)
        finally:
            if os.path.exists(tmp_path):
                try: os.remove(tmp_path)
                except OSError: pass

    def _write_md_atomic(self, st: Dict[str, Any]) -> None:
        lines = []
        created = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.get('created_at', time.time())))
        lines.append(f"# Plan\n\n**Created:** {created}\n")
        lines.append("## Steps\n")
        for step in st.get("steps", []):
            mark = (
                "✅" if step["status"] == "PASSED" else
                "❌" if step["status"] == "FAILED" else
                "⏳" if step["status"] == "RUNNING" else "⬜"
            )
            tool = step.get("tool") or "?"
            notes = f" — {step['notes']}" if step.get("notes") else ""
            lines.append(f"- {mark} **Step {step['idx']}** [{tool}]: {step['action']} → {step['target']}{notes}")
        text = "\n".join(lines)

        fd, tmp_path = tempfile.mkstemp(dir=self.dir, prefix="plan.", suffix=".md.tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(text)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.plan_md)
        finally:
            if os.path.exists(tmp_path):
                try: os.remove(tmp_path)
                except OSError: pass

    def _append_event_no_lock(self, obj: Dict[str, Any]) -> None:
        with open(self.events, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())