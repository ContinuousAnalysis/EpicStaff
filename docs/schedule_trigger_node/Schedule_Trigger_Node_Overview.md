Schedule Trigger Node Overview
==============================

The Schedule Trigger feature allows a graph to start its own execution on a
time-based schedule — either as a one-shot at a specific moment, or as a
recurring run (every N seconds/minutes/hours/days/weeks/months, optionally
restricted to specific weekdays, optionally capped by `end_date_time` or
`max_runs`).

The system is split across two services:

- **Django** — persistence, HTTP/API, business guards, `current_runs`
  accounting, signal publishing.
- **Manager** (FastAPI + APScheduler) — in-memory scheduler of jobs, consumes
  Redis updates, fires callbacks, publishes back to Django.

The two services communicate over a single Redis pub/sub channel:
`schedule_channel`. There is **no HTTP call** from Manager to Django.

1. Data Model
-------------

### ScheduleTriggerNode

Persisted in Django (`tables_scheduletriggernode`). One row per node.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | PK. Part of the global node sequence. |
| `graph_id` | FK | Graph this node belongs to. `related_name="schedule_trigger_node_list"`. |
| `node_name` | varchar(255) | Unique per graph. |
| `is_active` | bool | Master on/off switch; the Manager only registers jobs for active nodes. |
| `run_mode` | choice | `once` or `repeat`. |
| `start_date_time` | datetime | First fire time. For `once`, the only fire time. |
| `every` | int, nullable | Interval number (used only for `repeat`). |
| `unit` | choice, nullable | `seconds` \| `minutes` \| `hours` \| `days` \| `weeks` \| `months`. |
| `weekdays` | JSON array, nullable | Subset of `["mon","tue","wed","thu","fri","sat","sun"]`. Relevant only for `unit in {days, weeks}`. |
| `end_type` | choice | `never` \| `on_date` \| `after_n_runs`. |
| `end_date_time` | datetime, nullable | Required when `end_type="on_date"`. |
| `max_runs` | int, nullable | Required when `end_type="after_n_runs"`. |
| `current_runs` | int | Read-only counter maintained by the service. Reset to 0 on reactivation or `max_runs` change. |

The model exposes `RunMode`, `TimeUnit`, and `EndType` as `TextChoices`.

2. Public API Shape
-------------------

The HTTP serializer intentionally groups all schedule-related columns under a
single nested `schedule` block, while the DB keeps the flat columns. The
serializer translates both directions:

- **Input**: `to_internal_value` pops `schedule`, validates it against
  `_ScheduleConfigInputSerializer`, then flattens `run_mode`,
  `start_date_time`, `every`, `unit`, `weekdays`, `end_type`,
  `end_date_time`, `max_runs` onto the validated data before hitting
  `ModelSerializer.create`/`update`.
- **Output**: `_ScheduleConfigInputSerializer.to_representation` builds the
  nested block from the flat model columns (via DRF `source="*"`).

See `docs/schedule_trigger_node/Schedule_Trigger_Node_Endpoints.md` for the
exact request/response JSON shape and per-endpoint rules.

3. Cross-field Validation (`ScheduleTriggerValidator`)
------------------------------------------------------

Validation rules enforced before any DB write:

- `run_mode="once"` → `every` and `unit` must be `null` (equivalently,
  `interval` is `null` in the API shape).
- `run_mode="repeat"` → `every >= 1` is mandatory.
- `end_type="on_date"` → `end_date_time` is mandatory.
- `end_type="after_n_runs"` → `max_runs >= 1` is mandatory.
- `weekdays` must be a subset of `{mon, tue, wed, thu, fri, sat, sun}`.

4. Service Layer
----------------

### 4.1 Django — `ScheduleTriggerNodeViewSet`

Standard `ModelViewSet` exposing full CRUD at `/api/schedule-trigger-nodes/`.
Filters: `graph`, `is_active`, `run_mode`. Uses
`IdempotentNodeCreateMixin` (upsert on `(graph, node_name)` duplicates) and
`ContentHashPreconditionMixin` (optimistic concurrency via `content_hash`).

### 4.2 Django — `schedule_trigger_post_save_handler` / `schedule_trigger_post_delete_handler`

Django `post_save` / `post_delete` signal handlers on `ScheduleTriggerNode`.
After every commit they build a **flat wire-protocol payload** via
`_flat_schedule_payload(instance)` and publish a message to Redis
`schedule_channel`:

```json
{"action": "node_update", "data": {"action": "create" | "update" | "delete", "node": {...}}}
```

The flat projection is the inter-service contract with Manager — Manager
consumers read `run_mode`, `every`, `unit`, etc. directly from the dict; they
do not parse the nested HTTP JSON. `_flat_schedule_payload` must stay in sync
with `ScheduleTriggerNodeRepository.get_all_active_schedule_nodes()` in
Manager.

### 4.3 Manager — `ScheduleService`

FastAPI-side APScheduler manager. On startup:

1. `load_schedules_from_django()` — initial sync: reads all active nodes
   directly from the DB via `ScheduleTriggerNodeRepository`
   (`SELECT id, node_name, graph_id, is_active, run_mode, start_date_time,
   every, unit, weekdays, end_type, end_date_time, max_runs, current_runs
   FROM tables_scheduletriggernode WHERE is_active = true`) and registers an
   APScheduler job for each. Retries indefinitely on DB error (repository
   returns `None`); an empty list is a valid terminal state.
2. `scheduler.start()` — starts `AsyncIOScheduler` with `MemoryJobStore`.
3. `_start_redis_listener()` — subscribes to `schedule_channel` (async).

The scheduler has a global `EVENT_JOB_REMOVED` listener: `_on_job_removed`
(see 4.5).

### 4.4 Manager — `ScheduleTriggerNodeRepository`

Raw SQL access to `tables_scheduletriggernode` via SQLAlchemy async. Manager
runs under a restricted DB user (`manager_user`, SELECT/UPDATE only) — no
Django ORM is available on this side.

### 4.5 Manager — `self.schedule_nodes` and `self._manual_removals`

Two in-memory structures inside `ScheduleService`:

- `self.schedule_nodes: dict[int, str]` — `node_id → job_id` (where
  `job_id = f"schedule_{node_id}"`). Used to:
  - Find `job_id` by `node_id` in `remove_schedule`.
  - Detect **create vs update** (`node_id in self.schedule_nodes` → update).
  - Reverse-lookup `job_id → node_id` in `_on_job_removed` when
    APScheduler auto-removes a job.

- `self._manual_removals: set[str]` — one-shot flag set. The
  `EVENT_JOB_REMOVED` listener fires on **every** job removal — including
  APScheduler's own `replace_existing=True` path, which removes the old job
  before installing the new one. If we didn't flag these manual removals,
  `_on_job_removed` would publish `deactivate` for a node we just updated.
  Before any known-manual removal (`remove_schedule`, or `replace_existing`
  when the job already exists) we add the `job_id` to `_manual_removals`;
  `_on_job_removed` pops it and exits without publishing.

5. End-to-End Lifecycles
------------------------

### 5.1 Create / Update a schedule node

```
POST|PUT|PATCH /api/schedule-trigger-nodes/…
        │
        ▼
ScheduleTriggerNodeViewSet
        │
        ▼
ScheduleTriggerNodeSerializer (nested `schedule` → flat columns)
        │
        ▼
ScheduleTriggerValidator (cross-field rules)
        │
        ▼
Model.save()   →   post_save signal
                         │
                         ▼
       _flat_schedule_payload(instance) →  Redis `schedule_channel`
                                           {"action": "node_update",
                                            "data": {"action": "create"|"update",
                                                     "node": {...flat...}}}
        │
        ▼ (Manager side)
_start_redis_listener → branch on inner_action and payload:
        │
        ├─ is_active = False  → remove_schedule(node_id)
        │                          (pops from self.schedule_nodes,
        │                           flags job_id in _manual_removals,
        │                           scheduler.remove_job; idempotent if
        │                           already gone)
        │
        └─ is_active = True   → add_schedule(node_data):
                                  • build_trigger(node_data) picks
                                    DateTrigger / IntervalTrigger /
                                    CronTrigger based on run_mode+unit
                                  • if node_id ALREADY in self.schedule_nodes
                                    → add job_id to _manual_removals
                                    (so the replace_existing-driven
                                     EVENT_JOB_REMOVED is ignored)
                                  • self.schedule_nodes[node_id] = job_id
                                  • scheduler.add_job(
                                        id=f"schedule_{node_id}",
                                        replace_existing=True,
                                        …)
```

### 5.2 A job fires (APScheduler callback)

```
APScheduler timer reaches run_date
        │
        ▼ (Manager side)
execute_schedule(node_data):
    • Redis publish {"action": "run_session", "node_id": N}
    • if run_mode == "once":
        Redis publish {"action": "deactivate", "node_id": N}
        │
        ▼ (Django side)
schedule_channel_handler (Django pubsub)
        │
        ├─ action=="run_session"  → ScheduleTriggerService.handle_schedule_trigger(node_id)
        │                           (see 5.3)
        │
        └─ action=="deactivate"   → ScheduleTriggerNode is_active=False in DB
                                    → post_save fires
                                    → Redis node_update{is_active:false}
                                    → Manager remove_schedule(node_id)
```

### 5.3 `handle_schedule_trigger` (Django, transactional)

Wrapped in `@transaction.atomic`:

1. `SELECT … FOR UPDATE SKIP LOCKED` on `(id=node_id, is_active=True)`.
   Concurrent workers race for the fired node; only one wins, others exit
   silently (row is locked or node is inactive).
2. **Guard checks**:
   - `start_date_time > now` → exit (too early; should never happen once
     APScheduler fires, but defensive).
   - `end_type == "on_date"` and `end_date_time <= now` → publish
     `deactivate` to Redis and exit.
   - `end_type == "after_n_runs"` and `current_runs >= max_runs` → exit.
3. Start a session:
   `session_manager_service.run_session(graph_id, variables={}, entrypoint=<node_name>)`.
4. Atomically increment `current_runs` via `UPDATE … SET current_runs =
   current_runs + 1` (`F("current_runs") + 1`) — safe under concurrent
   increments.
5. `refresh_from_db()` and check the post-increment limit:
   - If `end_type == "after_n_runs"` and `current_runs >= max_runs` →
     publish `deactivate` to Redis (stops further fires).

### 5.4 Auto-deactivation at `end_date_time`

For a `repeat` node with `end_type="on_date"`, APScheduler's trigger
eventually returns `None` on the next fire attempt, and APScheduler removes
the job itself. The global `EVENT_JOB_REMOVED` listener
(`_on_job_removed`) fires:

1. If `job_id` is in `self._manual_removals` → pop and return (it was our own
   replace/remove).
2. Otherwise reverse-lookup `job_id → node_id` via `self.schedule_nodes`,
   pop the entry, and publish `{"action": "deactivate", "node_id": N}`.
3. Django receives `deactivate`, sets `is_active=False`, the resulting
   `post_save` would normally re-enter Manager — but since the Job is already
   gone and `node_id` was removed from `self.schedule_nodes`, `remove_schedule`
   logs a warning (`Job for node N not found`) and exits idempotently.

This is the only path where Manager itself initiates the `is_active=False`
write — all others are initiated by Django.

6. Invariants
-------------

- `self.schedule_nodes` in Manager is **the source of truth for currently
  scheduled jobs** from Manager's perspective. It must be kept in sync with
  APScheduler's internal job store: populated by `add_schedule`, drained by
  `remove_schedule` and `_on_job_removed`.
- `_manual_removals` is a **one-shot** set: every flag pushed in must be
  popped on the next matching `EVENT_JOB_REMOVED`. If you add a flag but
  never triggered a removal (e.g. `scheduler.add_job` raised), discard the
  flag (`add_schedule` does this in its `except` branch).
- `current_runs` is written **only** by Django, and always via
  `UPDATE … SET current_runs = F('current_runs') + 1` or by the serializer's
  custom `update()` (which resets it to 0 on reactivation or `max_runs`
  change). Never mutate it from Python attribute assignment.
- The wire-protocol payload to Redis must stay flat. Manager is not aware of
  the nested HTTP `schedule` block; changing the flat keys requires
  coordinated changes in both `_flat_schedule_payload` (Django) and
  `ScheduleTriggerNodeRepository.get_all_active_schedule_nodes()` (Manager).
- `handle_schedule_trigger` must run under `@transaction.atomic` with
  `SELECT FOR UPDATE SKIP LOCKED` — without it, two Django workers
  consuming the same Redis message would double-run the session and
  double-increment `current_runs`.

7. Related Files
----------------

Django:
- `tables/models/graph_models.py` — `ScheduleTriggerNode` model.
- `tables/serializers/model_serializers.py` — `ScheduleTriggerNodeSerializer`,
  `_ScheduleConfigInputSerializer`, `_ScheduleIntervalInputSerializer`,
  `_ScheduleEndInputSerializer`.
- `tables/validators/schedule_trigger_validator.py` — `ScheduleTriggerValidator`.
- `tables/views/model_view_sets.py` — `ScheduleTriggerNodeViewSet`.
- `tables/signals/schedule_signals.py` — `_flat_schedule_payload`,
  `schedule_trigger_post_save_handler`,
  `schedule_trigger_post_delete_handler`.
- `tables/services/schedule_trigger_service.py` — `ScheduleTriggerService`,
  `handle_schedule_trigger`, `generate_cron`.
- `tables/services/redis_pubsub.py` — Redis listener that routes
  `schedule_channel` messages into `ScheduleTriggerService`.
- `tables/services/graph_bulk_save_service/registry.py` — bulk-save
  registration of the node type.

Manager:
- `services/schedule_service.py` — `ScheduleService`, `add_schedule`,
  `remove_schedule`, `execute_schedule`, `_build_trigger`, `_make_cron`,
  `_on_job_removed`, `_start_redis_listener`.
- `repositories/schedule_trigger_repository.py` —
  `ScheduleTriggerNodeRepository.get_all_active_schedule_nodes`.
