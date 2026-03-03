---
id: epicstaff
name: EpicStaff Flow Management
version: 2.34
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
2. **Non-essential nodes stack vertically** — nodes that form one logical step, or auxiliary nodes that should not occupy their own step, are placed at the same X with incrementing Y.
3. **Each new step starts at the same Y level as the main flow.** The primary Y baseline in flow 42 is around y=100–200. New steps advance in X.
4. **Backward-connection nodes go up.** If a node connects back to an earlier step, place it at the Y level of the highest node it connects to.
5. **Never move existing nodes without user permission.**

### File Naming Convention (for push/pull/verify)
- `cdt_<slug>_pre.py` — CDT pre_computation_code
- `cdt_<slug>_post.py` — CDT post_computation_code
- `cdt_<slug>_groups.json` — CDT condition_groups
- `cdt_<slug>_prompts.json` — CDT prompts (dict keyed by prompt_id)
- `node_<slug>.py` — Python node code
- `webhook_<slug>.py` — Webhook trigger node code

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

### Gotchas

- **All node IDs change on every UI save.** Frontend deletes and recreates nodes. Never hardcode DB IDs — always query first.
- **Non-CDT node ports must be `null`, not `[]`.** Frontend only auto-generates ports when `ports === null`. Empty array silently breaks connections.
- **CDT ports are always regenerated** from condition groups. Port IDs: `{nodeId}_decision-route-{routeCode.toLowerCase()}`
- **Prompts must be dict, not list.** `converter_service.py` calls `.items()` — lists crash.
- **PATCH python_code without `libraries` wipes them.** Always include libraries in the payload.
- **Agent `tool_ids` PATCH is destructive replace.** Always include ALL existing tool_ids.
- **UI session viewer shows ALL state variables**, not the node's filtered input. Use `session-inspect <SESSION_ID>` to see actual node input.
- **Session messages filter:** use `session_id=` (not `session=`). Wrong param silently returns ALL rows.
- **Webhook/Telegram triggers hardcode `output_variable_path="variables"`** and `input_map="__all__"`. Metadata `output_variable_path` is ignored. To write into a DDD domain, return a nested dict: `{"request": {...}}`.

---

## Code Agent & EpicChat

The Code Agent node replaces manual OpenCode management (session creation, polling, streaming) with a single configurable node. The "code" container runs an Instance Manager (port 4080) that spawns OpenCode instances on demand per LLM config.

- **API endpoint**: `code-agent-nodes/` — standard CRUD
- **Key fields**: `llm_config` (FK, nullable), `agent_mode` (build/plan), `system_prompt`, `stream_handler_code`, `libraries`, timeout settings, `input_map`, `output_variable_path`, `output_schema`
- **Runtime**: The crew `CodeAgentNode` handles instance allocation, prompt submission, streaming, and cleanup
- **Stream handler**: User-provided Python callbacks (`on_stream_start`, `on_chunk`, `on_complete`) executed via sandbox
- **Session streaming**: Emits `GraphMessage` via `StreamWriter` → Redis → frontend + `run_session` callers
- **CLI**: `create-code-agent-node` — creates DB record + metadata entry in one command

### EpicChat Integration (Structured Output)

Code Agent nodes can return **structured JSON** to the EpicChat widget instead of plain text. This enables rich responses with markdown, tables, action buttons, links, and suggestion chips.

**How it works:**
1. Set `output_schema` on the Code Agent node (JSON schema that describes the response format)
2. The runtime sends the schema to OpenCode as `format: {type: "json_schema", schema: ...}`
3. OpenCode returns validated JSON in the `structured` field of the assistant message
4. The Code Agent node parses the structured output and returns it as the node result
5. EpicChat renders the response using the schema's structure (message, tables, buttons, etc.)

**Reference schema:** `docs/epicchat-response.schema.json` — comprehensive schema for EpicChat responses. The frontend UI pre-populates new Code Agent nodes with this schema by default.

**Key schema fields:**
- `message` (string) — Main response text (supports full markdown)
- `ep_table` (array of objects) — Structured data tables with column definitions and rows
- `action_message` (array of actions) — Interactive elements: buttons, links, prompt suggestions

### EpicChat Actions (user_input vs user_action)

EpicChat sends two different context fields depending on how the user interacts:

| Field | When | Semantics |
|---|---|---|
| `context.user_input` | User types a message or clicks a `prompt` suggestion | Conversational input — "the user said this" |
| `context.user_action` | User clicks a `button` with `action: "sendAction"` | Programmatic command — "the user clicked this button" |

**⚠️ CRITICAL:** For Code Agent nodes that receive EpicChat messages, the `input_map` MUST include BOTH:
```json
{
  "prompt": "variables.context.user_input",
  "action": "variables.context.user_action"
}
```

If only `prompt` is mapped, button clicks will crash with `AttributeError: 'DotDict' object has no attribute 'user_input'`.

The Code Agent's `get_input()` uses `set_missing_variables=True` so whichever field is absent gets `"not found"` (treated as empty) instead of crashing.

**Runtime resolution in `execute()`:**
- If `prompt` has text → used as the agent prompt (normal message)
- If only `action` has text → action text becomes the prompt
- If `action` matches a build trigger → mode switches to `build` (see below)

### Build Mode Pattern

Code Agent nodes run in their configured `agent_mode` (usually `plan` — read-only reasoning). To allow file creation/editing, the agent needs `build` mode. Instead of hardcoding `agent_mode=build`, use the **build permission pattern**:

1. Configure the node with `agent_mode=plan` (safe default)
2. The agent proposes a plan, then returns a structured response with an action button:
   ```json
   {
     "message": "Here's my plan: ...",
     "action_message": [
       {"type": "button", "text": "Allow build mode (3 turns)", "action": "sendAction"}
     ]
   }
   ```
3. User clicks → EpicChat sends `user_action: "Allow build mode (3 turns)"`
4. The Code Agent node detects the trigger, overrides `agent_mode` to `"build"`, and sends the prompt
5. The agent executes in build mode; remaining turns carry over automatically

**Option buttons** — when proposing multiple approaches, append ` - <label>` to the trigger:
```json
{
  "action_message": [
    {"type": "button", "text": "Allow build mode (3 turns) - Fix existing code", "action": "sendAction"},
    {"type": "button", "text": "Allow build mode (3 turns) - Rewrite from scratch", "action": "sendAction"}
  ]
}
```
The backend extracts the label and forwards it: *"The user selected: Fix existing code. Proceed."*

**Trigger format:** `"Allow build mode"` (1 turn), `"Allow build mode (N turns)"`, or `"Allow build mode (N turns) - <option>"`. Case-insensitive. Any action text that doesn't match is passed as a regular prompt.

### EpicChat-Specific Steps

1. PATCH `input_map` to include both `prompt` and `action` (MUST include both — see EpicChat Actions above)
2. Set `output_schema` on the node (UI Output Schema tab or API PATCH; default: `docs/epicchat-response.schema.json`)
3. Configure start node variables: `context: {}` (populated by EpicChat at runtime), `result: {}` (written by Code Agent output)

---

## Creating Flows

**Every new flow must satisfy ALL of the following before it is considered complete:**

### 1. Start Node Variables — Declare Everything

The `__start__` node's `variables` dict is the initial state for the entire flow. **Every variable that any node reads via `input_map` must be declared here**, even if its initial value is `null`. If a variable is missing from start, the flow will silently receive `None` at runtime.

- Use the **Domain dialog** (click the start node) or PATCH the start node via API to set variables.
- Review every node's `input_map` and trace each `variables.X` path back to start.

### 2. DDD-Style Dict Variables

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

### 3. Node Libraries

Every `create-node`, `create-webhook`, and `create-code-agent-node` command must include `--libraries` if the node code imports anything outside stdlib. `init-metadata` does NOT auto-detect or carry over libraries — they come solely from the DB node's `python_code.libraries` or `libraries` field.

### 4. Input Maps and Output Paths

- **All node types**: `init-metadata` reads `input_map` and `output_variable_path` from the DB. If the DB values are empty, Python nodes fall back to auto-parsing `main()` parameters → `variables.<param>`.
- **Python nodes**: Auto-parsed `input_map` works for simple cases but may need manual adjustment for DDD-style nested paths. `output_variable_path` defaults to `"variables"`.
- **Project (crew) nodes**: `input_map` and `output_variable_path` must be set on the DB crew node (via API or UI) before running `init-metadata`. The metadata `data.id` is populated from the crew ID.
- **Code Agent nodes**: The Code Agent runtime passes all `input_map` values as the stream handler `context` dict.

### 4a. Python Node `main()` Signature Rules (CRITICAL)

The runtime auto-generates `input_map` from the `main()` parameter names: each param `foo` maps to `variables.foo`. This means the parameter names **are** the input map keys.

**Rules:**
1. `main()` must accept **individual, granular parameters** — NEVER a broad `variables` or `**kwargs` dict.
2. Each parameter should map to the **smallest piece of state** the node actually needs.
3. Parameter names must match the DDD-style variable paths in the start node.
4. Use plain types (`str`, `dict`, `list`, `int`) — not `Dict[str, Any]` catch-alls.

**BAD — broad mapping (causes `variables = variables.variables`):**
```python
def main(variables: Dict[str, Any]) -> Dict[str, Any]:
    config = variables["jira"]  # deeply coupled to state structure
```

**GOOD — granular parameters (auto-maps to `jira = variables.jira`):**
```python
def main(jira: dict) -> dict:
    base_url = jira["base_url"]
    email = jira["email"]
    # ...
```


### 5. `init-metadata` Limitations

`init-metadata` rebuilds the metadata JSON from DB state. It handles:
- ✅ Node positions (auto-layout from edges)
- ✅ Connections (from DB edges)
- ✅ `input_map` and `output_variable_path` from DB for all node types
- ✅ Python node `input_map` fallback (auto-parsed from `main()` signature)
- ✅ Python node `output_variable_path` fallback (defaults to `"variables"`)
- ✅ Project node `data.id` (crew ID for frontend dialog)

It does **NOT** handle:
- ❌ Start node variables (must be set separately via Domain dialog or API)
- ❌ DDD-style nested input_map paths (auto-generates flat `variables.X`)
- ❌ Libraries on webhook/code-agent nodes (come from DB, must be set at creation time)

**After `init-metadata`, always review and patch:** start node variables, Code Agent input_maps, and any DDD-style path adjustments.

### End-to-End Mini Recipe

```bash
# 1. Create flow
python3 epicstaff_tools.py create-flow "My Flow" --description "..."

# 2. Create nodes (always include --libraries if needed)
python3 epicstaff_tools.py -g <ID> create-node "Process" --code-file process.py --libraries "requests,httpx"
python3 epicstaff_tools.py -g <ID> create-code-agent-node "Agent" --llm-config 2 \
  --code-file handler.py --libraries "google-auth,google-api-python-client"

# 3. Wire edges + generate metadata
python3 epicstaff_tools.py -g <ID> create-edge "__start__" "Process"
python3 epicstaff_tools.py -g <ID> create-edge "Process" "Agent"
python3 epicstaff_tools.py -g <ID> init-metadata

# 4. Set start node variables (DDD-style dicts) via Domain dialog or API
# 5. For EpicChat: PATCH input_map + output_schema (see EpicChat-Specific Steps)
# 6. Verify + test
python3 epicstaff_tools.py -r -g <ID> test-flow --verify
```

---

## Troubleshooting

**Always check recent sessions first** (`sessions -n 5`) — understand concurrent sessions, routes taken, completion status before diving in.

When a flow fails or returns nothing, follow this order:

1. **`sessions -n 3`** — look for `[error]`, premature `[graph_end]`, missing nodes in trace
2. **`route-map`** — CDT shows "NOT FOUND in metadata" → DB node_name ≠ metadata name
3. **`edges`** — 0 edges = no non-CDT routing possible
4. **`cdt-prompts`** — missing prompt_id → "name 'X' is not defined" error
5. **`cdt-code`** — empty `pre_input_map` → main() won't receive arguments (None/NameError)
6. **`export-compare <FILE>`** — spot missing prompts, changed input maps, code drift
7. **`verify .my_epicstaff/flows/<ID>/`** — ensures file ↔ DB ↔ metadata are in sync
8. **`oc-sessions` / `oc-status`** — stuck/stale OpenCode sessions ("Request queued")

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

---

## Lessons Learned

> **Self-improving skill:** When you encounter a problem or discover new information about the system, **add a note here** so the same mistake is never repeated. If the discovery is significant, **ask the user for permission to update the relevant section above**. Where possible, add hints to command returns to keep SKILL.md lean.

- **Decision Table nodes have NO edges — only metadata connections.** DT outputs (condition group `next_node`, `default_next_node`, `next_error_node`) are wired via metadata connections, not via the `edge_list` DB table. The `edges` command won't show DT routing. Use `connections` to see DT wiring. When rewiring DT outputs, use `patch-dt` to update condition groups — do NOT try to create/delete edges for DT outputs.
- **Python node API endpoint is `/pythonnodes/`** (no hyphen), not `/python-nodes/`. Other endpoints: `/code-agent-nodes/`, `/crewnodes/`, `/llmnodes/`.
- **`init-metadata` regenerates all connections** from both DB edges AND DT condition groups. Always run it after structural flow changes.
- **DT `condition_groups` PATCH requires `conditions: []` in each group.** The viewset's `_create_condition_groups` calls `pop("conditions")` on each group dict — if the key is missing, it raises `KeyError` and the entire PATCH silently rolls back. The `patch-dt` command now auto-adds this field.
