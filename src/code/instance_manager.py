"""
Instance Manager — manages a pool of OpenCode instances, one per LLM config.

Endpoints:
    GET  /instance/{llm_config_id}       → get or create instance, return port
    GET  /instances                       → list all running instances
    POST /instance/{llm_config_id}/stop   → stop a specific instance
    GET  /health                          → manager health check
"""

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, asdict
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from threading import Lock, Thread

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return val

MANAGER_PORT = int(_require_env("CODE_MANAGER_PORT"))
BASE_INSTANCE_PORT = int(_require_env("CODE_BASE_PORT"))
MAX_INSTANCES = int(_require_env("CODE_MAX_INSTANCES"))
IDLE_TIMEOUT = int(_require_env("CODE_IDLE_TIMEOUT"))
REAP_INTERVAL = int(_require_env("CODE_REAP_INTERVAL"))
DJANGO_API = _require_env("DJANGO_API_URL")
INSTANCES_DIR = Path(_require_env("CODE_INSTANCES_DIR"))
SAVEFILES_DIR = Path(_require_env("CONTAINER_SAVEFILES_PATH"))
SKILLS_SRC = Path("/home/user/root/app/opencode/skills")

# Provider → env var mapping
PROVIDER_KEY_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "google": "GOOGLE_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "xai": "XAI_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "together": "TOGETHER_API_KEY",
    "fireworks": "FIREWORKS_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


# ---------------------------------------------------------------------------
# Instance data
# ---------------------------------------------------------------------------

@dataclass
class Instance:
    llm_config_id: int
    port: int
    pid: int
    provider: str
    model: str
    home_dir: str
    started_at: float
    last_used: float


# ---------------------------------------------------------------------------
# Instance Pool
# ---------------------------------------------------------------------------

class InstancePool:
    def __init__(self):
        self._instances: dict[int, Instance] = {}  # llm_config_id → Instance
        self._lock = Lock()
        self._next_port = BASE_INSTANCE_PORT

    def get(self, config_id: int) -> Instance | None:
        with self._lock:
            inst = self._instances.get(config_id)
            if inst:
                inst.last_used = time.time()
            return inst

    def add(self, inst: Instance):
        with self._lock:
            self._instances[inst.llm_config_id] = inst

    def remove(self, config_id: int) -> Instance | None:
        with self._lock:
            return self._instances.pop(config_id, None)

    def all(self) -> list[Instance]:
        with self._lock:
            return list(self._instances.values())

    def count(self) -> int:
        with self._lock:
            return len(self._instances)

    def next_port(self) -> int:
        with self._lock:
            used_ports = {i.port for i in self._instances.values()}
            port = BASE_INSTANCE_PORT
            while port in used_ports:
                port += 1
            return port


pool = InstancePool()


# ---------------------------------------------------------------------------
# LLM config fetch
# ---------------------------------------------------------------------------

def _api_get(path: str) -> dict:
    """GET a JSON resource from the Django API."""
    url = f"{DJANGO_API}{path}"
    req = urllib.request.Request(url, headers={"Host": "localhost"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def fetch_llm_config(config_id: int) -> dict:
    """Fetch LLM config + resolve model name from Django API."""
    config = _api_get(f"/llm-configs/{config_id}/")
    # config["model"] is a numeric FK — resolve to actual model name
    model_id = config.get("model")
    if model_id and isinstance(model_id, int):
        try:
            model_rec = _api_get(f"/llm-models/{model_id}/")
            config["model_name"] = model_rec.get("name", str(model_id))
        except Exception as e:
            print(f"[InstanceManager] Warning: could not fetch model {model_id}: {e}")
    # Parse provider from custom_name (format: "provider/model-name")
    custom_name = config.get("custom_name", "")
    if "/" in custom_name and not config.get("provider"):
        config["provider"] = custom_name.split("/")[0].strip().lower()
    return config


# ---------------------------------------------------------------------------
# OpenCode instance lifecycle
# ---------------------------------------------------------------------------

def _write_opencode_config(home_dir: Path, provider: str, model: str):
    """Write opencode.json for this instance."""
    config_dir = home_dir / ".config" / "opencode"
    config_dir.mkdir(parents=True, exist_ok=True)

    config = {
        "$schema": "https://opencode.ai/config.json",
        "autoupdate": False,
        "share": "disabled",
        "model": f"{provider}/{model}",
        "provider": {
            provider: {
                "models": {
                    model: {}
                }
            }
        },
        "permission": {
            "*": "allow",
            "edit": "allow",
            "bash": "allow",
            "external_directory": "deny",
            "question": "deny",
        },
    }
    (config_dir / "opencode.json").write_text(json.dumps(config, indent=2))


def spawn_instance(config_id: int) -> Instance:
    """Spawn a new OpenCode instance for the given LLM config."""
    if pool.count() >= MAX_INSTANCES:
        raise RuntimeError(f"Max instances ({MAX_INSTANCES}) reached")

    llm_config = fetch_llm_config(config_id)
    provider = llm_config.get("provider")
    if not provider:
        raise RuntimeError(f"LLM config {config_id}: could not determine provider (custom_name={llm_config.get('custom_name')})")
    provider = provider.lower()
    model = llm_config.get("model_name")
    if not model:
        raise RuntimeError(f"LLM config {config_id}: could not resolve model name (model FK={llm_config.get('model')})")
    api_key = llm_config.get("api_key") or ""
    base_url = llm_config.get("base_url") or ""

    port = pool.next_port()
    home_dir = INSTANCES_DIR / str(config_id)
    home_dir.mkdir(parents=True, exist_ok=True)

    _write_opencode_config(home_dir, provider, model)

    env = os.environ.copy()
    env["HOME"] = str(home_dir)
    env["API_BASE_URL"] = DJANGO_API

    # Set the provider-specific API key env var
    key_var = PROVIDER_KEY_MAP.get(provider, f"{provider.upper()}_API_KEY")
    env[key_var] = api_key

    if base_url:
        env[f"{provider.upper()}_BASE_URL"] = base_url

    log_dir = home_dir / "log"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = open(log_dir / "opencode.log", "w")

    proc = subprocess.Popen(
        ["opencode", "serve", "--port", str(port), "--hostname", "0.0.0.0"],
        cwd=str(SAVEFILES_DIR),
        env=env,
        stdout=log_file,
        stderr=log_file,
    )

    # Wait for health
    healthy = False
    for _ in range(30):
        try:
            hreq = urllib.request.Request(f"http://localhost:{port}/global/health")
            with urllib.request.urlopen(hreq, timeout=2) as resp:
                data = json.loads(resp.read())
                if data.get("healthy"):
                    healthy = True
                    break
        except Exception:
            pass
        time.sleep(1)

    if not healthy:
        proc.kill()
        raise RuntimeError(f"OpenCode instance on port {port} failed to start")

    now = time.time()
    inst = Instance(
        llm_config_id=config_id,
        port=port,
        pid=proc.pid,
        provider=provider,
        model=model,
        home_dir=str(home_dir),
        started_at=now,
        last_used=now,
    )
    pool.add(inst)
    print(f"[InstanceManager] Spawned instance config={config_id} port={port} pid={proc.pid} model={provider}/{model}")
    return inst


def stop_instance(config_id: int) -> bool:
    """Stop an OpenCode instance."""
    inst = pool.remove(config_id)
    if not inst:
        return False
    try:
        os.kill(inst.pid, signal.SIGTERM)
        print(f"[InstanceManager] Stopped instance config={config_id} port={inst.port} pid={inst.pid}")
    except ProcessLookupError:
        print(f"[InstanceManager] Instance config={config_id} pid={inst.pid} already dead")
    return True


def reap_idle():
    """Kill instances that have been idle too long."""
    now = time.time()
    for inst in pool.all():
        if (now - inst.last_used) > IDLE_TIMEOUT:
            print(f"[InstanceManager] Reaping idle instance config={inst.llm_config_id}")
            stop_instance(inst.llm_config_id)


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class ManagerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.rstrip("/")

        if path == "/health":
            self._json_response({"healthy": True, "instances": pool.count()})

        elif path == "/instances":
            instances = [asdict(i) for i in pool.all()]
            self._json_response(instances)

        elif path.startswith("/instance/"):
            try:
                config_id = int(path.split("/")[2])
            except (IndexError, ValueError):
                self._json_response({"error": "Invalid config ID"}, status=400)
                return

            inst = pool.get(config_id)
            if inst:
                self._json_response({"port": inst.port, "status": "ready", **asdict(inst)})
                return

            # Spawn new instance
            try:
                inst = spawn_instance(config_id)
                self._json_response({"port": inst.port, "status": "ready", **asdict(inst)})
            except RuntimeError as e:
                self._json_response({"error": str(e)}, status=503)
            except Exception as e:
                self._json_response({"error": str(e)}, status=500)

        else:
            self._json_response({"error": "Not found"}, status=404)

    def do_POST(self):
        path = self.path.rstrip("/")

        if path.startswith("/instance/") and path.endswith("/stop"):
            try:
                config_id = int(path.split("/")[2])
            except (IndexError, ValueError):
                self._json_response({"error": "Invalid config ID"}, status=400)
                return

            if stop_instance(config_id):
                self._json_response({"stopped": True})
            else:
                self._json_response({"error": "Instance not found"}, status=404)
        else:
            self._json_response({"error": "Not found"}, status=404)

    def _json_response(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[InstanceManager] {args[0]}")


# ---------------------------------------------------------------------------
# Reaper thread
# ---------------------------------------------------------------------------

def _reaper_loop():
    while True:
        time.sleep(REAP_INTERVAL)
        try:
            reap_idle()
        except Exception as e:
            print(f"[InstanceManager] Reaper error: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Startup helpers
# ---------------------------------------------------------------------------

def sync_skills():
    """Copy canonical skill files from image to savefiles."""
    skills_dst = SAVEFILES_DIR / ".opencode" / "skills"
    if SKILLS_SRC.is_dir():
        skills_dst.mkdir(parents=True, exist_ok=True)
        subprocess.run(["cp", "-a", f"{SKILLS_SRC}/.", str(skills_dst)], check=True)
        print(f"[InstanceManager] Skill files synced to {skills_dst}")


def ensure_dirs():
    """Ensure required directory structure exists."""
    SAVEFILES_DIR.mkdir(parents=True, exist_ok=True)
    my_es = SAVEFILES_DIR / ".my_epicstaff"
    for sub in ("flows", "tools", "projects"):
        (my_es / sub).mkdir(parents=True, exist_ok=True)
    print(f"[InstanceManager] Directory structure verified")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"[InstanceManager] Starting on port {MANAGER_PORT}")
    print(f"[InstanceManager] Max instances: {MAX_INSTANCES}, idle timeout: {IDLE_TIMEOUT}s")

    ensure_dirs()
    sync_skills()

    # Start reaper thread
    reaper = Thread(target=_reaper_loop, daemon=True)
    reaper.start()

    # Start HTTP server
    server = HTTPServer(("0.0.0.0", MANAGER_PORT), ManagerHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[InstanceManager] Shutting down...")
        for inst in pool.all():
            stop_instance(inst.llm_config_id)
        server.server_close()


if __name__ == "__main__":
    main()
