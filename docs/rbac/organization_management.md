# Organization Management — Superadmin

Five endpoints for managing `Organization` rows from the superadmin admin
panel. All endpoints require `is_superadmin=True`. Anonymous → 401;
authenticated non-superadmin → 403 (`code: permission_denied`).

Base URL in examples: `http://localhost:8000`.

---

## Quick reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/organizations/` | List all organizations with member counts |
| POST | `/api/admin/organizations/` | Create an organization |
| PATCH | `/api/admin/organizations/{id}/` | Rename an organization |
| POST | `/api/admin/organizations/{id}/deactivate/` | Soft-deactivate an organization |
| POST | `/api/admin/organizations/{id}/reactivate/` | Re-activate a deactivated organization |

---

## Common response shape

Every endpoint returns the same payload (single object or list):

```json
{
  "id": 7,
  "name": "Acme Inc",
  "is_active": true,
  "member_count": 12,
  "created_at": "2026-04-29T10:00:00Z",
  "updated_at": "2026-04-29T10:00:00Z"
}
```

`member_count` reflects the count of `OrganizationUser` rows for the org,
across all roles, regardless of `user.is_active`. Story 5 may introduce
`active_member_count` later as a separate field.

## Common error envelopes

Validation envelope (FormValidationError):

```json
{
  "status_code": 400,
  "code": "invalid",
  "message": "FormValidationError: Validation failed",
  "errors": [
    {"field": "name", "value": "", "reason": "This field is required."}
  ]
}
```

Domain-error envelope:

```json
{
  "status_code": 400,
  "code": "organization_name_conflict",
  "message": "OrganizationNameConflictError: An organization with this name already exists."
}
```

Authorization 403 (non-superadmin):

```json
{
  "status_code": 403,
  "code": "permission_denied",
  "message": "Superadmin privileges are required for this action."
}
```

---

## GET `/api/admin/organizations/`

List all organizations. Default returns active and inactive both, ordered
`is_active` desc then `name` asc.

**Query params:**

| Param | Values | Default |
|---|---|---|
| `is_active` | `true` / `false` | unset → returns all |

**curl:**

```bash
curl http://localhost:8000/api/admin/organizations/ \
  -H "Authorization: Bearer $ACCESS"
```

**200:**

```json
[
  {"id": 1, "name": "Default Organization", "is_active": true, "member_count": 1, "created_at": "...", "updated_at": "..."},
  {"id": 7, "name": "Acme Inc", "is_active": true, "member_count": 12, "created_at": "...", "updated_at": "..."},
  {"id": 4, "name": "Old Co", "is_active": false, "member_count": 3, "created_at": "...", "updated_at": "..."}
]
```

---

## POST `/api/admin/organizations/`

Create an organization.

**Body:** `{"name": "Acme Inc"}`. Trimmed; max 255 chars; must be non-blank.

**curl:**

```bash
curl -X POST http://localhost:8000/api/admin/organizations/ \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc"}'
```

**201:** the new organization payload (with `member_count: 0`).

**Errors:**

- `400 invalid` — empty / whitespace-only / wrong type → `errors[]` envelope.
- `400 organization_name_conflict` — case-insensitive duplicate.

---

## PATCH `/api/admin/organizations/{id}/`

Rename an organization. Only the `name` field is accepted; `is_active` changes
go through the dedicated deactivate/reactivate endpoints.

**Body:** `{"name": "Acme International"}`.

**200:** the updated organization payload. No-op (no `updated_at` change) if
the new name equals the current name (case-sensitive).

**Errors:** same as POST plus `404` for unknown id.

---

## POST `/api/admin/organizations/{id}/deactivate/`

Soft-deactivate. Sets `is_active=false`. **Memberships are preserved** —
`OrganizationUser` rows stay intact. Reactivation restores access exactly as
it was.

**Body:** none.

**200:** organization payload with `is_active: false`.

**Idempotent:** already-inactive orgs return 200 with the unchanged payload.

**Errors:**

- `400 last_active_organization` — would leave zero active orgs in the system.
- `404` — unknown id.

---

## POST `/api/admin/organizations/{id}/reactivate/`

Inverse of deactivate. No guards — always succeeds for an existing org.

**Body:** none.

**200:** organization payload with `is_active: true`. Idempotent on already-active.

**Errors:** `404` — unknown id.

---

## Behavioral notes for the FE

| Behavior | Note |
|---|---|
| Default org name | The org named `DEFAULT_ORGANIZATION_NAME` is **not** treated specially. It can be renamed, deactivated (subject to last-active guard), and reactivated like any other org. The env var only controls bootstrap. |
| Inactive orgs in the org switcher | Until Story 7 lands, `/api/auth/me/` still includes inactive-org memberships in `memberships[]`. The FE should grey out orgs with `is_active=false` and prevent selecting them as the active org. |
| Renaming behavior | Surrounding whitespace is trimmed. Empty / whitespace-only is rejected. Case-insensitive uniqueness — `"Acme"` and `"acme"` collide. |
| 401 vs 403 | 401 = no/expired token (re-login). 403 = valid JWT but `is_superadmin: false` (redirect away from admin panel). |

---

## Bug 1 fix — `/api/auth/reset-user/` post-condition

After Story 4, a successful `POST /api/auth/reset-user/` always leaves
exactly one `OrganizationUser` row for the new superadmin in the
`DEFAULT_ORGANIZATION_NAME`-named org with role `Superadmin`. If no such org
exists at the time of reset, one is created. `GET /api/auth/me/` returns
`memberships[]` with that one entry.

This restores the Bug 1 reproduction's expected end state.
