---
id: epicstaff
name: EpicStaff Flow Management
version: 1.1
trigger: always_on
triggers: [epicstaff, epic-staff, flows, sessions]
scope: [api, cli, integration]
description: EpicStaff flow management — inspecting, debugging, syncing, and patching flows and sessions via the epicstaff_tools.py CLI
---

# EpicStaff Flow Management Skill

## Primary Tool

**Always use `epicstaff_tools.py`** for ALL flow and session operations.

### ⛔ NEVER call the API directly — use epicstaff_tools.py CLI ONLY

This applies to **ALL agents** — Cascade, OpenCode, and any other coding assistant.

**Do NOT** write raw `urllib`, `requests`, `curl`, or any direct HTTP calls to the Django API.
**Do NOT** use `python3 -c "..."` one-liners that import from `common.py` or call API endpoints.
**Do NOT** import from `common.py` or any of the module files directly in ad-hoc scripts.
**Do NOT** create throwaway Python scripts to "quickly check" API responses.

**Always** use the `epicstaff_tools.py` CLI commands below. They handle error handling, dual-store sync (DB + metadata), and correct serialization.

**Decision tree when you need data:**
1. Does a CLI command exist? → Use it.
2. No command exists? → **Add it** to `epicstaff_tools.py` first, then use the CLI.
3. Never skip step 2 by writing a raw script — even for "just checking" something.

### Testing Flows

**Structural verification** (read-only, use `-r`):
```bash
# Basic check — nodes, edges, connections, CDT groups, Python code
python3 epicstaff_tools.py -r -g 42 test-flow

# Verbose — show node/edge details
python3 epicstaff_tools.py -r -g 42 test-flow -v

# Also verify local files match DB + metadata
python3 epicstaff_tools.py -r -g 42 test-flow --verify
```
Always test a flow after creating or modifying it.

**Run a session** (NOT read-only — triggers actual flow execution):
```bash
# Trigger flow and poll until done (default 300s timeout)
python3 epicstaff_tools.py -g 42 run-session

# With variables and custom timeout
python3 epicstaff_tools.py -g 42 run-session --variables '{"key": "value"}' --timeout 120
```

### File Structure

```
  .env                 — Port configuration (DJANGO_PORT, OPENCODE_PORT)
  epicstaff_tools.py   — CLI entry point (thin dispatcher)
  common.py            — Shared API helpers, constants, utilities
  flows_read.py        — Flow inspection, CDT read, sessions, OpenCode read
  flows_write.py       — Push, pull, patch, sync, rename, OpenCode abort
  flows_create.py      — Create new flows and nodes
  tools_read.py        — Tool listing and detail
  tools_write.py       — Pull/push tools
  tools_create.py      — Create new tools
  projects_read.py     — Crew/agent inspection
  projects_write.py    — Pull/push project configs
  projects_create.py   — Create new crews/agents/tasks
```

### ⚠️ ALWAYS use `-r` for read-only commands

**This is critical.** The `-r` flag marks the command as safe to auto-run without user approval. **Every read-only command MUST include `-r`**, otherwise the user has to manually approve each call:

```bash
# CORRECT — auto-runs without blocking:
python3 epicstaff_tools.py -r -g 42 sessions -n 3
python3 epicstaff_tools.py -r -g 42 cdt-code
python3 epicstaff_tools.py -r oc-status

# WRONG — will block waiting for user approval:
python3 epicstaff_tools.py -g 42 sessions -n 3
```

Read-only commands: `list`, `get`, `nodes`, `edges`, `connections`, `route-map`, `cdt`, `cdt-code`, `cdt-prompts`, `sessions`, `session`, `session-inspect`, `session-timings`, `vars`, `history`, `trace`, `crew-input`, `crews`, `agents`, `tools`, `tool`, `oc-status`, `oc-sessions`, `oc-messages`, `verify`, `export-compare`, `test-flow`.

Write commands (`push`, `pull`, `patch-*`, `sync-metadata`, `oc-abort`, `run-session`) and create commands (`create-*`) do NOT use `-r` — they require user approval.

### Requires `-g <GRAPH_ID>`

`get`, `nodes`, `edges`, `connections`, `route-map`, `cdt`, `cdt-code`, `cdt-prompts`, `sessions`, `vars`, `history`, `push`, `pull`, `verify`, `export-compare`, `patch-cdt`, `patch-python`, `patch-webhook`, `sync-metadata`, `rename-node`, `pull-project`, `pull-tools`, `create-node`, `create-edge`, `create-note`, `init-metadata`, `test-flow`, `run-session`, `crews` (optional), `agents` (optional), `tools` (optional).

**Exception:** `cdt-code` requires `-g` unless `--cdt-id` is provided.

**Does NOT require `-g`:** `list`, `session`, `session-inspect`, `session-timings`, `crews`, `agents`, `tools`, `tool`, `crew-input`, `oc-status`, `oc-sessions`, `oc-messages`, `oc-abort`, `create-flow`, `create-tool`, `create-crew`, `create-agent`, `create-task`, `push-tools`, `push-project`.

### Local backups: `.my_epicstaff/`

This directory contains the **full local copy** of flow code, tool code, and project configs pulled from the DB:
- `.my_epicstaff/flows/<flow_id>/` — CDT pre/post computation code, condition groups, prompts, Python node code
- `.my_epicstaff/tools/<flow_id>/` — tool code + metadata (args_schema, description)
- `.my_epicstaff/projects/<flow_id>/` — crew, agent, task configs

**⚠️ IMPORTANT:** These directories are readable and writable. **You can read and write them directly.**

**Safety workflow:** `pull` → edit locally → `verify` → `push` or `patch-*` → `test-flow`. Write operations require explicit user approval.

---

## Quick Reference

### Inspection
```bash
# List all flows
python3 epicstaff_tools.py -r list

# Flow overview
python3 epicstaff_tools.py -r -g <GRAPH_ID> get
python3 epicstaff_tools.py -r -g <GRAPH_ID> nodes
python3 epicstaff_tools.py -r -g <GRAPH_ID> edges
python3 epicstaff_tools.py -r -g <GRAPH_ID> connections

# CDT details
python3 epicstaff_tools.py -r -g <GRAPH_ID> cdt
python3 epicstaff_tools.py -r -g <GRAPH_ID> cdt-code
python3 epicstaff_tools.py -r -g <GRAPH_ID> cdt-prompts

# Verify CDT routing (CRITICAL before testing)
python3 epicstaff_tools.py -r -g <GRAPH_ID> route-map
```

### Session Debugging
```bash
# Last 2 sessions
python3 epicstaff_tools.py -r -g <GRAPH_ID> sessions
python3 epicstaff_tools.py -r -g <GRAPH_ID> sessions -n 5 -c  # compact

# Specific session
python3 epicstaff_tools.py -r session <SESSION_ID> <SESSION_ID>

# Inspect per-node input/output (what each node actually received/produced)
python3 epicstaff_tools.py -r session-inspect <SESSION_ID>

# Per-node timing breakdown (deltas + duration bar chart)
python3 epicstaff_tools.py -r session-timings <SESSION_ID>

# Persistent variables, message history
python3 epicstaff_tools.py -r -g <GRAPH_ID> vars
python3 epicstaff_tools.py -r -g <GRAPH_ID> history <CHAT_ID>

# Crew node input/output
python3 epicstaff_tools.py -r crew-input <SESSION_ID>
```

### Project / Crew / Agent / Tool
```bash
# Show flow's crew with agents, tasks, tools, input_map
python3 epicstaff_tools.py -r -g <GRAPH_ID> crews

# List all crews (no -g) or flow's agents
python3 epicstaff_tools.py -r crews
python3 epicstaff_tools.py -r -g <GRAPH_ID> agents

# List tools (all or flow-scoped)
python3 epicstaff_tools.py -r -g <GRAPH_ID> tools

# Show tool details including code
python3 epicstaff_tools.py -r tool <TOOL_ID>
```

### OpenCode (Sandbox Container)
```bash
# Check if any OpenCode session is busy
python3 epicstaff_tools.py -r oc-status

# List all sessions with stale detection
python3 epicstaff_tools.py -r oc-sessions

# View last N messages in a session
python3 epicstaff_tools.py -r oc-messages -n 20

# Abort a stuck/stale request (write — no -r)
python3 epicstaff_tools.py oc-abort
```

### Data Sync — Flows
```bash
# Pull current DB state to local files
python3 epicstaff_tools.py -g <GRAPH_ID> pull

# Push local files to DB + metadata
python3 epicstaff_tools.py -g <GRAPH_ID> push .my_epicstaff/flows/<GRAPH_ID>/

# Three-way verify: file <-> DB <-> metadata
python3 epicstaff_tools.py -r -g <GRAPH_ID> verify .my_epicstaff/flows/<GRAPH_ID>/

# Compare export with current state
python3 epicstaff_tools.py -r -g <GRAPH_ID> export-compare <EXPORT_FILE>
```

### Data Sync — Tools
```bash
# Pull tool code + metadata for flow's agents
python3 epicstaff_tools.py -g <GRAPH_ID> pull-tools

# Pull ALL tools (no -g)
python3 epicstaff_tools.py pull-tools

# Push tool code back
python3 epicstaff_tools.py push-tools .my_epicstaff/tools/<GRAPH_ID>/
```

### Data Sync — Projects (Crew/Agent/Task)
```bash
# Pull crew, agent, task configs
python3 epicstaff_tools.py -g <GRAPH_ID> pull-project

# Push configs back
python3 epicstaff_tools.py push-project .my_epicstaff/projects/<GRAPH_ID>/
```

### Patching
```bash
# Patch CDT field (by node name — ID resolved automatically)
python3 epicstaff_tools.py -g <GRAPH_ID> patch-cdt "Orchestrator" post_computation_code --value-file code.py

# Patch Python node
python3 epicstaff_tools.py -g <GRAPH_ID> patch-python "Send reply (Telegram)" --value-file code.py

# Patch webhook node
python3 epicstaff_tools.py -g <GRAPH_ID> patch-webhook "Flow Designer Webhook" --value-file code.py

# Rename a Python node (DB + metadata + edges)
python3 epicstaff_tools.py -g <GRAPH_ID> rename-node "Old Name" "New Name"

# Sync CDT code into metadata
python3 epicstaff_tools.py -g <GRAPH_ID> sync-metadata
```

### Creating Resources
```bash
# Create a new flow
python3 epicstaff_tools.py create-flow "My New Flow" --description "Description"

# Create a Python node in a flow
python3 epicstaff_tools.py -g <GRAPH_ID> create-node <node_name> --code-file code.py

# Create a Code Agent node (OpenCode-powered)
python3 epicstaff_tools.py -g <GRAPH_ID> create-code-agent-node <node_name> \
  --llm-config 2 --agent-mode build --system-prompt "You are helpful" \
  --code-file stream_handler.py --libraries "requests,httpx" \
  --output-variable-path code_reply --x 400 --y 100

# Create a Webhook Trigger node
python3 epicstaff_tools.py -g <GRAPH_ID> create-webhook <node_name> \
  --code-file webhook_handler.py --webhook-path "my_webhook" --x -400 --y 0

# Create an edge between two nodes
# Note: edges to __end__ are NOT mandatory — __end__ is implied for terminal nodes (no outgoing edges)
python3 epicstaff_tools.py -g <GRAPH_ID> create-edge <start_node> <end_node>

# Generate metadata (positions + connections) from DB state
python3 epicstaff_tools.py -g <GRAPH_ID> init-metadata

# Create a tool
python3 epicstaff_tools.py create-tool <tool_name> --description <description> --code-file tool.py

# Create a crew
python3 epicstaff_tools.py create-crew <crew_name> --process sequential

# Create an agent and add to a crew (ALWAYS set --llm-config)
python3 epicstaff_tools.py create-agent <role> --goal <goal> --llm-config <CONFIG_ID> --crew-id <CREW_ID>

# Create a task and assign to agent + crew
python3 epicstaff_tools.py create-task <task_name> --instructions <instructions> --agent-id <AGENT_ID> --crew-id <CREW_ID>
```

> **⚠️ Agent LLM Config**: Every agent MUST have an `llm_config` set, otherwise it cannot run. Use `--llm-config <ID>` at creation time, or PATCH afterwards. List available configs with `epicstaff_tools.py -r llm-configs`.

> **⚠️ Crew Node in Flow**: When adding a crew to a flow as a crew node, you MUST set:
> - `input_map`: maps the node's parameters to flow variables (e.g. `{"topic": "variables.request.topic"}`)
> - `output_variable_path`: set to `"variables"` or `"variables.<domain>"` so downstream nodes can read the crew's output

### Canvas Notes

Notes are metadata-only annotations on the flow canvas. Use sparingly — only for nodes that genuinely need explanation.

```bash
# Add a note near a specific node
python3 epicstaff_tools.py -g <GRAPH_ID> create-note "Handles queueing" --near "Stream Coding GChat"

# Add a note at specific coordinates
python3 epicstaff_tools.py -g <GRAPH_ID> create-note "Important context" --x 400 --y 200

# Custom color (default: #ffffd1 yellow)
python3 epicstaff_tools.py -g <GRAPH_ID> create-note "Warning" --near "Message Intake" --color "#ffd1d1"
```

**Guidelines:** Do NOT clutter the canvas with notes. Only add them when a node's purpose or behavior is non-obvious and would confuse someone reading the flow.

### Node Placement Rules (for `create-node`)

Every new node **must** have coordinates (`--x` and `--y`). If omitted, auto-placement stacks below the last step. Use flow 42 as the reference layout — it is centered and fills the screen.

**Coordinate system:** X increases left-to-right (each logical step is a new X column). Y increases top-to-bottom (stacked nodes within a step share the same X). Typical step gap: ~400–500px in X. Typical stack gap: ~60px in Y.

**Rules (apply unless the user specifies otherwise):**

1. **Every node must have explicit coordinates.** Check existing node positions first (`nodes` command or metadata) to determine proper placement.
2. **Non-essential nodes stack vertically** — nodes that form one logical step, or auxiliary nodes that should not occupy their own step, are placed at the same X with incrementing Y (e.g. `Send reply (Telegram)` y=502, `Send reply to google chat` y=562, `Stream crew reply to GChat` y=647 — all at x=733).
3. **Each new step starts at the same Y level as the main flow.** The primary Y baseline in flow 42 is around y=100–200. New steps advance in X.
4. **Backward-connection nodes go up.** If a node connects back to an earlier step, place it at the Y level of the highest node it connects to (e.g. `Create a good reply (#1)` at y=-138 connects back up to the crew/orchestrator level).
5. **Never move existing nodes without user permission.**

**Example — flow 42 layout (sorted by X):**
```
x=  -566  Triggers (GChat, Telegram)        — stacked vertically
x=  -148  Message Intake, Prepare Context    — stacked vertically
x=   200  Orchestrator CDT                   — main routing step
x=   733  Send reply nodes (3)               — stacked vertically
x=  1229  Post-Send Router CDT
x=  1634  Create a good reply (crew)         — y=-138 (backward connection, placed high)
x=  1752  Coding Router CDT
x=  2169  Stream Coding nodes + Manage Hist  — stacked vertically
x=  2647  update message history
```

### File Naming Convention (for push/pull/verify)
- `cdt_<slug>_pre.py` — CDT pre_computation_code
- `cdt_<slug>_post.py` — CDT post_computation_code
- `cdt_<slug>_groups.json` — CDT condition_groups
- `cdt_<slug>_prompts.json` — CDT prompts (dict keyed by prompt_id)
- `node_<slug>.py` — Python node code
- `webhook_<slug>.py` — Webhook trigger node code

---

## Troubleshooting Checklist

**IMPORTANT:** When investigating sessions, ALWAYS first check all recent sessions (`sessions -n 5`) to understand the full picture — concurrent sessions, routes taken, completion status. Never jump to conclusions from a single session.

When a flow session fails or returns nothing, follow this order:

### 1. Check the session messages
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> sessions -n 3
```
Look for: `[error]` messages, premature `[graph_end]`, missing nodes in the trace.

### 2. Verify CDT route maps
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> route-map
```
If any CDT shows "NOT FOUND in metadata" or empty route_map with dock_visible groups, the **DB node_name doesn't match metadata node_name**.

### 3. Check DB edges (non-CDT routing)
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> edges
```
If 0 edges, the backend can't route between non-CDT nodes. DB edges are only for non-CDT routing.

### 4. Check CDT prompts exist
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> cdt-prompts
```
If a condition group references a `prompt_id` that doesn't exist, the expression will fail with "name 'X' is not defined".

### 5. Check input maps
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> cdt-code
```
If `pre_input_map` is empty or missing expected parameters, the pre-computation `main()` function won't receive its arguments (they'll default to None, or cause NameError if referenced outside the function).

### 6. Compare with a known-good export
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> export-compare <EXPORT_FILE>
```
Spot missing prompts, changed input maps, missing groups, or code drift.

### 7. Three-way verify local files
```bash
python3 epicstaff_tools.py -r -g <GRAPH_ID> verify .my_epicstaff/flows/<GRAPH_ID>/
```
Ensures file, DB, and metadata are all in sync.

### 8. Check OpenCode session state (for coding routes)
```bash
python3 epicstaff_tools.py -r oc-sessions
python3 epicstaff_tools.py -r oc-status
```
If a coding session shows "Request queued", check if another flow session or manual OpenCode usage was holding the session busy. `oc-sessions` marks stale sessions (not updated in >5 min).

---

## Architecture (Must-Know Rules)

### Configuration (.env)

The `.env` file is colocated with `epicstaff_tools.py`. Environment variables override `.env` values:
- `DJANGO_PORT` — Django API port (default: 8000)
- `OPENCODE_PORT` — OpenCode server port inside sandbox (default: 4096)
- `API_BASE_URL` — Full API URL override (e.g. `http://django_app:8000/api` inside Docker)

The tool resolves `.my_epicstaff/` at the repo root (3 levels up from the skill directory).

### Common Failures

| Error | Likely Cause |
|---|---|
| `Connection refused` | Backend not running, wrong `API_BASE_URL` or `DJANGO_PORT` |
| `HTTP 404` | Wrong endpoint or resource ID; check API path |
| `HTTP 500` | Backend bug; check Django logs |
| `Timed out: no response for 60 seconds` | OpenCode down, wrong `modelID`, or missing API key |
| Node shows as black dot | Metadata out of sync; run `init-metadata` to regenerate from DB |

### Always Run `init-metadata` After Creating Nodes

After `create-node`, `create-webhook`, or `create-edge`, always run:
```bash
python3 epicstaff_tools.py -g <GRAPH_ID> init-metadata
```
This regenerates all metadata (positions, connections, ports) from DB state. Without it, nodes may render as black dots or have broken wiring in the UI.

### Two Data Stores Must Stay in Sync

1. **DB** — Django models. Backend crew runtime reads from here.
2. **Metadata** — `Graph.metadata` JSON. Frontend reads/writes here.

**Always patch BOTH.** The `push` and `patch-*` commands in epicstaff_tools.py do this automatically.

### CDT Routing Uses Metadata Connections (NOT DB Edges)

- `_build_route_maps` (`session_manager_service.py:95`) builds route_map from metadata connections
- Matches DB `node_name` against metadata `node_name` to find UUID
- **DB name MUST match metadata node_name** or routing fails silently

### DB Edges Are Only for Non-CDT Routing

- `save-graph.service.ts` skips CDT/TABLE source nodes when creating DB edges
- CDT outputs route via metadata connections + route_map

### Edge API Has No Server-Side Filtering

`EdgeViewSet` has no `filter_backends` or `filterset_fields`. The query parameter `?graph=<id>` is **silently ignored** — the API returns ALL edges across ALL flows. The `edges` CLI command filters client-side. Do not assume raw API responses are scoped to a flow.

### Renaming a Node Requires DB + Metadata + Edges

DB edges reference nodes by `start_key`/`end_key` (name string). Use the `rename-node` command:
```bash
python3 epicstaff_tools.py -g <GRAPH_ID> rename-node "Old Name" "New Name"
```
This updates all three in one shot: DB node name, metadata label/name, and all edges.

Missing any of the three causes: `"Found edge starting at unknown node 'Old Name'"` at session start.

### CDT Node IDs Change on Every UI Save

Frontend deletes all CDT nodes and recreates them. **Never hardcode CDT DB IDs.**

### Non-CDT Node Ports Must Be `null`, NOT `[]`

Frontend only auto-generates ports when `node.ports === null`. Empty array `[]` silently breaks connections.

### CDT Ports Are Always Regenerated

Frontend unconditionally regenerates CDT ports from condition groups. Port IDs: `{nodeId}_decision-route-{routeCode.toLowerCase()}`

### Prompts Must Be Dict, Not List

`converter_service.py` calls `.items()` on prompts. Lists cause runtime crash.

### Python Node Libraries Are Nested and Easy to Wipe

PATCH `{"python_code": {"code": "..."}}` without `libraries` wipes them. Always include libraries.

### Agent PATCH Wipes Tools

`tool_ids` is a destructive replace. Always include ALL existing tool_ids when PATCHing an agent.

### UI Session Viewer Shows ALL State Variables

The frontend session viewer's "variables" section for a node shows **all** `state["variables"]` at that execution point — NOT the node's filtered `input`. This includes every other variable in state. To see what a node **actually received** as input, use `session-inspect`:
```bash
python3 epicstaff_tools.py -r session-inspect <SESSION_ID>
```

### Session Messages Filter

Use `session_id=` (NOT `session=`). Wrong param silently returns ALL rows.

### Webhook/Telegram Trigger Nodes Hardcode `output_variable_path`

`WebhookTriggerNode` and `TelegramTriggerNode` constructors hardcode `output_variable_path="variables"` and `input_map="__all__"`. The metadata `output_variable_path` is **ignored by the runtime**. To write into a DDD domain (e.g. `variables.request`), the webhook code itself must return a nested dict: `{"request": {"space_name": "...", ...}}`. The flat merge at `variables` level then creates/replaces `variables.request`.

### Code Agent Node (New Approach)

The Code Agent node replaces manual OpenCode management (session creation, polling, streaming) with a single configurable node. The "code" container runs an Instance Manager (port 4080) that spawns OpenCode instances on demand per LLM config.

- **API endpoint**: `code-agent-nodes/` — standard CRUD
- **Key fields**: `llm_config` (FK, nullable), `agent_mode` (build/plan), `system_prompt`, `stream_handler_code`, `libraries`, timeout settings, `input_map`, `output_variable_path`
- **Runtime**: The crew `CodeAgentNode` handles instance allocation, prompt submission, streaming, and cleanup
- **Stream handler**: User-provided Python callbacks (`on_stream_start`, `on_chunk`, `on_complete`) executed via sandbox
- **Session streaming**: Emits `GraphMessage` via `StreamWriter` → Redis → frontend + `run_session` callers
- **CLI**: `create-code-agent-node` — creates DB record + metadata entry in one command

### OpenCode Session Management (Legacy)

- OpenCode runs inside the `sandbox` container on port 4096
- Sessions are reused per chat_id (title=`epicstaff_{chat_id}`)
- The Coding Router pre-computation (`cdt_coding_router_pre.py`) finds/creates the session
- The streaming node (`node_stream_coding_gchat.py`) calls `_wait_for_idle` before posting
- **Active-busy** (concurrent flow session running) → streaming node shows "Request queued" and waits — this is correct behavior
- **Stale-busy** (abandoned from manual use, >5 min old) → pre-computation detects and aborts automatically
- The OpenCode session is shared between flow usage and manual usage — stale state from manual use can cause "Request queued" delays
- `oc-abort` can manually clear a stuck session

### Flow Creation Checklist

**Every new flow must satisfy ALL of the following before it is considered complete:**

#### 1. Start Node Variables — Declare Everything

The `__start__` node's `variables` dict is the initial state for the entire flow. **Every variable that any node reads via `input_map` must be declared here**, even if its initial value is `null`. If a variable is missing from start, the flow will silently receive `None` at runtime.

- Use the **Domain dialog** (click the start node) or PATCH the start node via API to set variables.
- Review every node's `input_map` and trace each `variables.X` path back to start.

#### 2. DDD-Style Dict Variables

Prefer **grouped dict variables** that resemble Domain-Driven Design objects. This keeps the variable namespace clean and lets nodes access related data via dot notation.

**Bad — flat namespace:**
```json
{
  "service_account_info": { "type": "service_account", "...": "..." },
  "opencode_model_id": "gpt-5",
  "opencode_provider_id": "openai"
}
```

**Good — DDD-style dicts:**
```json
{
  "gchat": {
    "service_account_info": { "type": "service_account", "...": "..." }
  },
  "opencode": {
    "model_id": "gpt-5",
    "provider_id": "openai"
  }
}
```

Then `input_map` references: `"service_account_info": "variables.gchat.service_account_info"`.

#### 3. Node Libraries

Every `create-node`, `create-webhook`, and `create-code-agent-node` command must include `--libraries` if the node code imports anything outside stdlib. `init-metadata` does NOT auto-detect or carry over libraries — they come solely from the DB node's `python_code.libraries` or `libraries` field.

#### 4. Input Maps and Output Paths

- **Python nodes**: `init-metadata` auto-parses `main()` parameters to generate `input_map` mapping each param to `variables.<param>`. This works for simple cases but may need manual adjustment for DDD-style nested paths.
- **Code Agent nodes**: `input_map` is NOT auto-generated. You must set it manually after `init-metadata`. The Code Agent runtime passes all input_map values as the stream handler `context` dict.
- **output_variable_path**: For Python nodes, defaults to `"variables"` (merges returned dict into graph state). For Code Agent nodes, set explicitly if downstream nodes need to read its output (e.g. `"variables"`).

#### 5. `init-metadata` Limitations

`init-metadata` rebuilds the metadata JSON from DB state. It handles:
- ✅ Node positions (auto-layout from edges)
- ✅ Connections (from DB edges)
- ✅ Python node `input_map` (from `main()` signature)
- ✅ Python node `output_variable_path` (defaults to `"variables"`)

It does **NOT** handle:
- ❌ Start node variables (must be set separately via Domain dialog or API)
- ❌ Code Agent node `input_map` (must be set manually)
- ❌ DDD-style nested input_map paths (auto-generates flat `variables.X`)
- ❌ Libraries on webhook/code-agent nodes (come from DB, must be set at creation time)

**After `init-metadata`, always review and patch:** start node variables, Code Agent input_maps, and any DDD-style path adjustments.

### End-to-End Mini Recipe

```bash
# 1. Create flow + start node (automatic)
python3 epicstaff_tools.py create-flow "My Flow" --description "..."

# 2. Create nodes (always include --libraries if needed)
python3 epicstaff_tools.py -r -g <ID> nodes
python3 epicstaff_tools.py -g <ID> create-webhook "My Webhook" --code-file wh.py --webhook-path "my_wh"
python3 epicstaff_tools.py -g <ID> create-node "Process" --code-file process.py --libraries "requests,httpx"
python3 epicstaff_tools.py -g <ID> create-code-agent-node "Agent" --llm-config 2 \
  --code-file handler.py --libraries "google-auth,google-api-python-client"

# 3. Wire edges
python3 epicstaff_tools.py -g <ID> create-edge "__start__" "Process"
python3 epicstaff_tools.py -g <ID> create-edge "My Webhook" "Process"
python3 epicstaff_tools.py -g <ID> create-edge "Process" "Agent"
python3 epicstaff_tools.py -g <ID> init-metadata

# 4. Set start node variables (DDD-style dicts)
#    Use Domain dialog or PATCH /startnodes/<start_id>/

# 5. Verify input_maps, adjust Code Agent input_map manually
python3 epicstaff_tools.py -r -g <ID> get --json | python3 -c "..."

# 6. Verify + test
python3 epicstaff_tools.py -r -g <ID> route-map
python3 epicstaff_tools.py -g <ID> pull
python3 epicstaff_tools.py -r -g <ID> verify .my_epicstaff/flows/<ID>/
python3 epicstaff_tools.py -r -g <ID> test-flow --verify
```

---

## Updating This Skill

If you discover new information about how EpicStaff flows, sessions, or APIs work that is NOT covered here, **ask the user for permission to update this skill file**. Include:
- What you learned
- Where in the codebase you found it
- Proposed addition to this file

This keeps the skill accurate and saves debugging time in future sessions.

---

## Additional API References

### Python Code Tools (Agent Tools)

Tools run in sandboxed containers. Key endpoints:
- `GET/POST /api/python-code-tool/` — list/create
- `GET/PATCH /api/python-code-tool/<id>/` — read/update

Agent's `main()` docstring determines when the agent uses the tool. Always include: what, when, args, returns, examples.

Tool assignment: `tool_ids` on agent PATCH (destructive replace — include ALL IDs).

### Knowledge & GraphRAG

Key endpoints:
- `POST /api/graph-rag/collections/{coll_id}/graph-rag/` — create
- `GET /api/graph-rag/{id}/` — details
- `PUT /api/graph-rag/{id}/index-config/` — update config
- `POST /api/process-rag-indexing/` — trigger indexing (body: `{"rag_id": N, "rag_type": "graph"}`)

Gotchas: one GraphRAG per collection, LLM field is read-only (use Django shell), indexing runs async in knowledge container.
