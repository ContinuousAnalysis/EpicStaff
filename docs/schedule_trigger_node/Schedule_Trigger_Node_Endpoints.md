Schedule Trigger API Endpoints
==============================

HTTP surface for managing Schedule Trigger nodes. The API groups all
schedule-related fields under a single nested `schedule` block on both
request and response. The server internally persists them as flat columns —
you don't need to care about that on the client side.

Common base URL (subject to your deployment): `/api/schedule-trigger-nodes/`.

All requests use `Content-Type: application/json`.

---

## 1. List nodes

- **Endpoint**: `GET /api/schedule-trigger-nodes/`
- **Query params** (all optional):
  - `graph` — filter by graph id.
  - `is_active` — `true` / `false`.
  - `run_mode` — `once` / `repeat`.
  - `limit`, `offset` — standard pagination.

### 1.1 Response — `200 OK`

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    { /* full node object, see §2.4 */ }
  ]
}
```

---

## 2. Create a node

- **Endpoint**: `POST /api/schedule-trigger-nodes/`
- **Behavior**: if a node with the same `(graph, node_name)` already exists,
  it is updated in place instead of failing with a unique-constraint error
  (idempotent create).

### 2.1 Request body

```js
{
  "node_name": "Schedule Trigger (#1)",        // string, unique within the graph
  "graph": 1,                                  // int, graph id
  "is_active": true,                           // bool, default true
  "metadata": {},                              // object, free-form (UI position, etc.)
  "schedule": {                                // object, REQUIRED on POST
    "run_mode": "once" | "repeat",
    "start_date_time": "2026-04-09T12:00:00",  // ISO-8601 datetime
    "interval": {                              // object | null (null if run_mode="once")
      "every": 1,                              // int >= 1 (required when run_mode="repeat")
      "unit": "seconds" | "minutes" | "hours" | "days" | "weeks" | "months",
      "weekdays": ["mon","tue","wed","thu","fri","sat","sun"]  // or []
    },
    "end": {                                   // object, ALWAYS present
      "type": "never" | "on_date" | "after_n_runs",
      "date_time": "2026-12-31T23:59:59",      // ISO-8601, required if type="on_date", else null
      "max_runs": 3                            // int >= 1, required if type="after_n_runs", else null
    }
  }
}
```

### 2.2 Field descriptions

**Top level**

| Field | Type | Required | Notes |
|---|---|---|---|
| `node_name` | string | yes | Unique per graph. |
| `graph` | int | yes | Parent graph id. |
| `is_active` | bool | no (default `true`) | When `false`, the Manager will not register an APScheduler job for this node. |
| `metadata` | object | no | Free-form (canvas position, icon, color, etc.). |
| `schedule` | object | yes on POST / PUT | Nested schedule config (see below). Optional on PATCH. |

**`schedule`**

| Field | Type | Notes |
|---|---|---|
| `run_mode` | `"once"` \| `"repeat"` | Discriminator. |
| `start_date_time` | ISO-8601 datetime | First (and only, for `once`) fire time. |
| `interval` | object \| null | Recurring settings; `null` for `once`. |
| `end` | object | Stop condition (always present, even for `once`). |

**`schedule.interval`** (only meaningful when `run_mode="repeat"`)

| Field | Type | Notes |
|---|---|---|
| `every` | int ≥ 1 \| null | Interval number. Required when `run_mode="repeat"`. |
| `unit` | choice \| null | `seconds` / `minutes` / `hours` / `days` / `weeks` / `months`. Required when `run_mode="repeat"`. |
| `weekdays` | array of string \| `[]` | Subset of `["mon","tue","wed","thu","fri","sat","sun"]`. Meaningful only for `unit ∈ {days, weeks}`. |

**`schedule.end`**

| Field | Type | Notes |
|---|---|---|
| `type` | `"never"` \| `"on_date"` \| `"after_n_runs"` | Discriminator. |
| `date_time` | ISO-8601 \| null | Required when `type="on_date"`, otherwise `null`. |
| `max_runs` | int ≥ 1 \| null | Required when `type="after_n_runs"`, otherwise `null`. |

### 2.3 Cross-field validation rules

- `run_mode="once"` → `interval` is `null` (equivalently `every`/`unit`/
  `weekdays` are empty) **and** `end.type` must be `"never"`.
- `run_mode="repeat"` → `interval.every >= 1` and `interval.unit` are
  **required**.
- `end.type="never"` → `end.date_time` and `end.max_runs` must both be
  `null`.
- `end.type="on_date"` → `end.date_time` is **required** and must be
  **later than** `schedule.start_date_time`.
- `end.type="after_n_runs"` → `end.max_runs >= 1` is **required**.
- `interval.weekdays` must be a subset of
  `["mon","tue","wed","thu","fri","sat","sun"]` and is only allowed when
  `interval.unit ∈ {"days", "weeks"}`.

A failing rule returns `400 Bad Request` with a structured error:

```json
{
  "schedule": {
    "end": { "date_time": ["Required for end_type=\"on_date\"."] }
  }
}
```

### 2.4 Response — `201 Created`

```js
{
  "id": 42,                                    // int, PK (read-only)
  "node_name": "Schedule Trigger (#1)",
  "graph": 1,
  "is_active": true,
  "metadata": {},
  "content_hash": "…",                         // string, read-only
  "created_at": "2026-04-09T12:00:00Z",        // ISO-8601, read-only
  "updated_at": "2026-04-09T12:00:00Z",        // ISO-8601, read-only
  "current_runs": 0,                           // int, read-only
                                               // Counter of actual fires. Reset to 0
                                               // on reactivation (is_active: false→true)
                                               // or when max_runs changes.
  "schedule": {
    "run_mode": "once" | "repeat",
    "start_date_time": "2026-04-09T12:00:00Z",
    "interval": {                              // null when run_mode="once"
      "every": 1,
      "unit": "seconds" | "minutes" | "hours" | "days" | "weeks" | "months",
      "weekdays": ["mon", /* … */]             // or [] when unset
    },
    "end": {
      "type": "never" | "on_date" | "after_n_runs",
      "date_time": "2026-12-31T23:59:59Z",     // null unless type="on_date"
      "max_runs": 3                            // null unless type="after_n_runs"
    }
  }
}
```

---

## 3. Retrieve a node

- **Endpoint**: `GET /api/schedule-trigger-nodes/{id}/`
- **Response — `200 OK`**: same object shape as §2.4.

---

## 4. Replace a node (PUT)

- **Endpoint**: `PUT /api/schedule-trigger-nodes/{id}/`
- **Behavior**: full replace. All writable fields (including `schedule`) are
  required.
- **Request body**: same as §2.1.
- **Response — `200 OK`**: same shape as §2.4.

---

## 5. Partially update a node (PATCH)

- **Endpoint**: `PATCH /api/schedule-trigger-nodes/{id}/`
- **Behavior**: updates only the fields you send. `schedule` is optional; if
  you include it, you **must** send the full block (inner cross-field rules
  still apply). If you omit `schedule`, the existing schedule is unchanged.

### 5.1 Example — reactivate and cap at 2 more fires

```json
{
  "is_active": true,
  "schedule": {
    "run_mode": "repeat",
    "start_date_time": "2026-04-22T23:35:00+03:00",
    "interval": { "every": 5, "unit": "minutes", "weekdays": [] },
    "end": { "type": "after_n_runs", "date_time": null, "max_runs": 2 }
  }
}
```

Server behavior:

- `is_active: false → true` resets `current_runs` to 0.
- Any change to `max_runs` also resets `current_runs` to 0.

### 5.2 Example — flip off without touching schedule

```json
{ "is_active": false }
```

### 5.3 Response — `200 OK`: same shape as §2.4.

---

## 6. Delete a node

- **Endpoint**: `DELETE /api/schedule-trigger-nodes/{id}/`
- **Response — `204 No Content`**.

Deleting a node also tears down the in-memory APScheduler job on the Manager
side via the `post_delete` signal.

---

## 7. Variations of the `schedule` block

These are concrete examples of the same nested shape, ready to paste into
any request body:

### 7.1 One-shot run at a specific moment

```json
"schedule": {
  "run_mode": "once",
  "start_date_time": "2026-04-09T12:00:00Z",
  "interval": null,
  "end": { "type": "never", "date_time": null, "max_runs": null }
}
```

### 7.2 Every N seconds, unbounded

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-09T12:00:00Z",
  "interval": { "every": 30, "unit": "seconds", "weekdays": [] },
  "end": { "type": "never", "date_time": null, "max_runs": null }
}
```

### 7.3 Every N minutes, capped by runs

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-09T12:00:00Z",
  "interval": { "every": 5, "unit": "minutes", "weekdays": [] },
  "end": { "type": "after_n_runs", "date_time": null, "max_runs": 20 }
}
```

### 7.4 Every N hours, capped by a deadline

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-09T09:00:00Z",
  "interval": { "every": 2, "unit": "hours", "weekdays": [] },
  "end": { "type": "on_date", "date_time": "2026-06-01T00:00:00Z", "max_runs": null }
}
```

### 7.5 Daily on weekdays

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-09T09:00:00Z",
  "interval": {
    "every": 1,
    "unit": "days",
    "weekdays": ["mon", "tue", "wed", "thu", "fri"]
  },
  "end": { "type": "never", "date_time": null, "max_runs": null }
}
```

### 7.6 Weekly on selected days

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-09T10:00:00Z",
  "interval": { "every": 1, "unit": "weeks", "weekdays": ["mon", "wed"] },
  "end": { "type": "never", "date_time": null, "max_runs": null }
}
```

### 7.7 Monthly

```json
"schedule": {
  "run_mode": "repeat",
  "start_date_time": "2026-04-01T09:00:00Z",
  "interval": { "every": 1, "unit": "months", "weekdays": [] },
  "end": { "type": "never", "date_time": null, "max_runs": null }
}
```

---

## 8. Error responses

Standard DRF error shapes:

- Cross-field rule violated inside `schedule`:
  ```json
  { "schedule": { "end": { "date_time": ["Required for end_type=\"on_date\"."] } } }
  ```
- Missing required `schedule` on POST/PUT:
  ```json
  { "schedule": ["This field is required."] }
  ```
- Non-field-level error:
  ```json
  { "non_field_errors": ["..."] }
  ```
- Model-level conflicts (unique, FK) follow DRF defaults.

---

## 9. Bulk save integration

Schedule trigger nodes are also part of the graph-wide atomic bulk save
endpoint. See `docs/bulk_save/BULK_SAVE_API.md`.

- **Endpoint**: `POST /api/graphs/{pk}/save/`
- Keys:
  - `schedule_trigger_node_list` — create/update items with the same shape
    as §2.1 (plus optional `id`, and optional `temp_id` for edges in the
    same request).
  - `deleted.schedule_trigger_node_ids` — list of ids to delete.

Use this endpoint when you need to create a schedule node and wire an edge
to another node in the same request; `temp_id` on the schedule node can be
referenced from `edge_list[].start_temp_id` / `end_temp_id`.
