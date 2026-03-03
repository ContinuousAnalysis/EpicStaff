# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Constraints

> **IMPORTANT: ALWAYS use specialized agents for ALL code generation. NEVER write or edit code directly in the main conversation.**
>
> - Use the `Agent` tool with the appropriate specialist subagent (`angular-dev`, `django-api-dev`, `flow-editor-dev`, `python-ai-dev`, etc.) for any code changes.
> - The main conversation may only perform read-only operations (Glob, Grep, Read) and orchestration.
> - Direct code edits (Edit, Write, NotebookEdit) in the main conversation are forbidden for code files.

## Project Overview

EpicStaff is an open-source Agentic UI platform for multi-agent orchestration and visual workflow automation. It has an Angular 19 frontend and a Python microservices backend powered by CrewAI.

## Repository Structure

```
EpicStaff/
├── frontend/          # Angular 19 frontend application
├── src/               # Python backend microservices
│   ├── django_app/    # Django REST API (primary backend)
│   ├── crew/          # CrewAI orchestration engine
│   ├── sandbox/       # Sandboxed Python code execution
│   ├── tool/          # Custom & MCP tool implementations
│   ├── manager/       # Service coordination
│   ├── webhook/       # Webhook trigger handling
│   ├── voice_app/     # Voice agent capabilities
│   ├── realtime/      # WebSocket real-time layer
│   ├── knowledge/     # RAG knowledge management
│   └── docker-compose.yaml
├── integration_tests/ # End-to-end tests
└── docs/              # Feature documentation
```

## Commands

### Frontend (run from `frontend/`)

```bash
npm start        # Dev server at http://localhost:4200 (no HMR)
npm run build    # Production build → dist/frontend-crewai/
npm run watch    # Watch mode (development config)
npm test         # Unit tests via Karma/Jasmine
```

### Backend (each service uses Poetry, run from its directory)

```bash
# Django REST API
cd src/django_app && poetry install && python manage.py runserver

# CrewAI orchestration engine
cd src/crew && poetry install && python main.py

# Sandbox (Python code execution)
cd src/sandbox && poetry install && python main.py

# Tool service
cd src/tool && poetry install && python app.py

# Manager
cd src/manager && poetry install && python app.py
```

### Full Stack (Docker)

```bash
cd src && docker-compose up --build
```

### Python linting (from repo root)

```bash
pre-commit run --all-files   # Ruff formatter + linter + YAML checks
```

## Commit Message Format

```
type(TICKET-AREA): description
```

Examples:
- `feat(EST-1793-FE): add go-to-flow button in flow node`
- `fix(EST-2111-FE): remove response format field from LLM config`
- `refactor(EST-2132-FE): rename services and models to kebab-case`

Areas: `-FE` (frontend), `-BE` (backend).

## GitHub Workflow

- **Default branch:** `main`
- **Remote:** `origin` (SSH via `github-work` host alias — `git@github-work:EpicStaff/EpicStaff.git`)
- **Branching:** Feature branches off `main`; name them `feature/<TICKET-ID>-<short-desc>`
- **PRs:** Use `gh pr create` targeting `main`; include summary + test plan in the PR body
- **CI checks:** Use `gh run list` / `gh run view` to inspect pipeline status
- **Issue reference:** Include ticket IDs in commit messages and PR titles (e.g., `EST-1234`)
- **Pre-commit linting:** Run `pre-commit run --all-files` before pushing (Ruff formatter + linter)
- **Context7:** Append `use context7` to agent prompts to fetch up-to-date library docs

## Frontend Architecture

### Tech Stack
- Angular 19, Angular Material 19 (cyan-orange theme), SCSS
- `@foblex/flow` — node-based visual workflow editor
- Monaco Editor — in-browser code editing
- ag-grid — data tables
- Angular Signals — state management (not NgRx)

### Module Structure (`frontend/src/app/`)

| Directory | Role |
|---|---|
| `features/` | Self-contained feature modules (flows, projects, tools, knowledge-sources, settings-dialog) |
| `visual-programming/` | Core flow editor: nodes, panels, edges, ports, services |
| `open-project-page/` | Project workspace page (agents, tasks, details) |
| `pages/` | Top-level routed pages (flows-page, staff-page, running-graph, chats-page) |
| `layouts/` | Main layout shell with sidenav |
| `shared/` | Reusable components, models, directives, utils |
| `services/` | App-wide singleton services (config, LLM, embeddings, notifications) |
| `core/` | Guards, enums, app-wide directives |

### Routes

```
/projects            → ProjectsListPageComponent
/projects/:id        → OpenProjectPageComponent
/staff               → StaffPageComponent
/tools               → ToolsListPageComponent (built-in / custom / mcp tabs)
/flows               → FlowsListPageComponent
/flows/:id           → FlowVisualProgrammingComponent (canDeactivate: UnsavedChangesGuard)
/graph/:id/session/:id → RunningGraphComponent
/knowledge-sources   → CollectionsListPageComponent
/chats               → ChatsPageComponent
```

### Service Pattern

Each feature area uses a two-service pattern:
- `*-api.service.ts` — HTTP calls only (thin wrapper around `HttpClient`)
- `*-storage.service.ts` — State using Angular signals, caching, delegates to API service

The app-wide `ConfigService` is initialized at startup (`APP_INITIALIZER`) and provides `configService.apiUrl` used by all API services.

### Visual Programming (Flow Editor)

`visual-programming/` is the most complex module:
- `core/enums/node-type.ts` — canonical `NodeType` enum
- `core/models/node.model.ts` — base node model
- `core/rules/` — per-node-type default port definitions
- `core/enums/node-panel.map.ts` — maps `NodeType` → panel component
- `components/nodes-components/` — visual node components (rendered in canvas)
- `components/node-panels/` — side-panel detail editors (one per node type)
- `services/flow.service.ts` — primary service coordinating flow state
- `services/side-panel.service.ts` / `sidepanel-manager.service.ts` — side-panel open/close logic
- `services/undo-redo.service.ts` — undo/redo stack

### TypeScript Path Aliases

Configured in `frontend/tsconfig.json`:
- `@shared/*` → `src/app/shared/*`
- `@services` → `src/app/services/index.ts`

### Naming Conventions (Frontend)

- File names: **kebab-case** (e.g., `flows-api.service.ts`, `flow-base-node.component.ts`)
- Services: suffix `-api.service.ts` or `-storage.service.ts` accordingly
- Components use standalone component pattern (Angular 19)
- `inject()` function preferred over constructor injection

## Backend Architecture

### Service Responsibilities

| Service | Entry Point | Role |
|---|---|---|
| `django_app` | `manage.py` | REST API, database models, admin |
| `crew` | `main.py` | CrewAI graph execution, agent orchestration |
| `sandbox` | `main.py` | Sandboxed Python code execution |
| `tool` | `app.py` | Custom tool & MCP tool execution |
| `manager` | `app.py` | Service coordination |
| `webhook` | — | Webhook trigger system |
| `voice_app` | — | Voice agent (OpenAI Realtime API) |

### Key Libraries
- **CrewAI** (custom local version in `src/crew/libraries/`) — agent orchestration
- **LiteLLM** — multi-provider LLM support (OpenAI, Anthropic, Groq, etc.)
- **Django REST Framework** — REST API with Swagger via `drf-yasg`
- **pgvector** — vector embeddings in PostgreSQL for RAG
- **Pydantic v2** — data validation throughout services

### Python Code Quality
- **Ruff** for formatting and linting (configured in `.pre-commit-config.yaml`)
- Excluded from linting: `crew/libraries/`, `tool/`, `tests/`, `migrations/`
- Python ≥3.12 required

## Data Flow: Flow Execution

1. Frontend saves a flow graph (nodes + edges) to `django_app` via REST API (`/graphs/` endpoint)
2. Frontend triggers execution → `crew` service receives the graph
3. `crew` builds a CrewAI workflow, runs agents, calls tools via `tool` service
4. Python code nodes execute in `sandbox` service
5. Real-time updates stream back via WebSocket (`realtime` service)
6. Frontend `RunningGraphComponent` displays live execution state
