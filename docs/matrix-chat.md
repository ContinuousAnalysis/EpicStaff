# Matrix Chat Integration

EpicStaff flows (AI agent pipelines) can be exposed as Matrix chat bots. Real users open
Element Web at `/chat`, send a message to a flow's bot user, the flow runs as a new session,
and the bot replies with the output.

## Architecture

```
Browser → http://${DOMAIN_NAME}/chat  ──────────────► epicstaff-element (Element Web)
                                                             │ Matrix CS API
Browser → http://${DOMAIN_NAME}/_matrix/  ◄───────────────  │
                   │                                          │
                   ▼                                          │
         epicstaff-synapse (Synapse homeserver)               │
                   │                                          │
                   │ App Service HTTP POST /transactions/{id} │
                   ▼                                          │
         epicstaff-matrix-bridge (FastAPI)                    │
                   │                                          │
     ┌─────────────┼──────────────────────────────────────────┘
     │             │
     │  POST /api/run-session/ ──► django_app
     │                                │
     │                         Redis sessions:schema ──► crew ──► executes flow
     │                                                                  │
     │  Subscribe Redis sessions:session_status ◄───────────────────────┘
     │
     └─ GET /api/sessions/{id}/ ──► django_app (read output variables)
     └─ Matrix CS API: send reply in room as bot user
```

Bot user IDs follow the pattern: `@_epicstaff_flow_{slug}_{flow_id}:{DOMAIN_NAME}`

For example, a flow named "My Awesome Flow" with id=3 becomes:
`@_epicstaff_flow_my_awesome_flow_3:localhost`

## Quick Start

### Prerequisites

Add these environment variables to `src/.env` (alongside the existing `DOMAIN_NAME`):

```dotenv
# Matrix Chat Integration
MATRIX_AS_TOKEN=your_secure_random_as_token_here
MATRIX_HS_TOKEN=your_secure_random_hs_token_here
MATRIX_DB_PASSWORD=matrix_db_password
```

Generate secure tokens with:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```
Run it twice — once for `MATRIX_AS_TOKEN` and once for `MATRIX_HS_TOKEN`.

### Start the stack

```bash
cd src
docker-compose up --build
```

This starts 5 new containers:
| Container | Role |
|---|---|
| `epicstaff-matrix-db` | PostgreSQL 16 for Synapse (separate from `crewdb`) |
| `epicstaff-synapse` | Matrix homeserver (Synapse) |
| `epicstaff-element` | Element Web client at `/chat` |
| `epicstaff-matrix-bridge` | FastAPI bridge between Matrix and EpicStaff |
| `epicstaff-matrix-admin` | Synapse Admin UI at `/matrix-admin/` |

Wait ~60 seconds for Synapse to initialize on first run.

### Verify the deployment

```bash
# Matrix homeserver responds
curl http://localhost/_matrix/client/versions

# Element Web is accessible
open http://localhost/chat

# Register a test user in Element Web, then start chatting with a flow bot
```

## Enabling a Flow as a Matrix Bot

### Via the UI

1. Open **EpicStaff** at `http://localhost`
2. Navigate to **Flows**
3. Hover over a flow card → click the **⋮** (three dots) action menu
4. Select **Matrix Bot**
5. The dialog shows:
   - **Input Variable** — the flow variable that receives the incoming message (default: `message`)
   - **Output Variable** — the flow variable whose value is sent back as the reply (default: `context`)
   - **Enabled** toggle
6. Click **Enable** to activate the bot

After enabling, the dialog displays the bot's **Matrix User ID** (e.g. `@_epicstaff_flow_my_flow_1:localhost`).

### Via the API

```bash
# Enable a flow (id=1) as a Matrix bot
curl -X POST http://localhost/api/matrix-bots/ \
  -H "Content-Type: application/json" \
  -d '{"flow": 1}'

# Response
{
  "id": 1,
  "flow": 1,
  "matrix_user_id": "@_epicstaff_flow_my_first_flow_1:localhost",
  "input_variable": "message",
  "output_variable": "context",
  "enabled": true,
  "created_at": "2026-01-01T00:00:00Z"
}
```

## Starting a Conversation

1. Open Element Web at `http://localhost/chat`
2. Register a new user (registration is open by default)
3. Start a **Direct Message** with the bot user ID, e.g. `@_epicstaff_flow_my_flow_1:localhost`
4. The bot will automatically accept the invite and join the room
5. Send a message — the flow starts executing with your message as the input variable
6. When the flow finishes (status = "end"), the bot replies with the output variable value

## Variable Mapping

Each flow bot has two configurable variables:

| Setting | Description | Default |
|---|---|---|
| `input_variable` | The flow variable set to the incoming chat message text | `message` |
| `output_variable` | The flow variable read from when composing the reply | `context` |

**Example**: If your flow has a Start node that seeds `message` and an End node that stores the result in `context`, the defaults work out of the box.

**Customizing**: If your flow uses different variable names (e.g. `user_input` → `answer`), update the bot's input/output variable names to match via the Matrix Bot dialog or API.

## Configuration Reference

All Matrix-related env vars (add to `src/.env`):

| Variable | Description | Default |
|---|---|---|
| `MATRIX_AS_TOKEN` | Application Service token (bridge → Synapse auth) | **required** |
| `MATRIX_HS_TOKEN` | Homeserver token (Synapse → bridge auth) | **required** |
| `MATRIX_DB_PASSWORD` | Password for the `epicstaff-matrix-db` PostgreSQL container | `matrix_db_password` |
| `DOMAIN_NAME` | Already required by EpicStaff — Matrix reuses it automatically | (existing) |
| `MATRIX_BRIDGE_PORT` | Internal port for the bridge FastAPI service | `8060` |

`MATRIX_AS_TOKEN` and `MATRIX_HS_TOKEN` must be random, secret, and different from each other.

## Production Notes

### Disable open registration

Once you've created your admin account, disable open registration in Synapse by setting
`enable_registration: false` in `src/matrix/synapse/homeserver.yaml.template` and rebuilding:

```bash
docker-compose build epicstaff-synapse && docker-compose up -d epicstaff-synapse
```

### Use a real domain name

Set `DOMAIN_NAME` to your public domain (e.g. `example.com`) and configure HTTPS in the
nginx config (`src/nginx/templates/default.conf.template`). Synapse requires TLS for
federation with other Matrix homeservers.

### Creating the first admin account

Use the helper script:

```bash
cd src
./matrix/scripts/create_admin.sh admin mysecurepassword
```

Then log in at `http://localhost/matrix-admin/` with the homeserver URL `http://localhost`
to manage users, rooms, and media via the Synapse Admin panel.

### Resource considerations

- `epicstaff-matrix-db` is a separate PostgreSQL container dedicated to Synapse.
  It does **not** share storage with `crewdb`.
- Synapse stores media files in the `synapse_data` Docker volume.
- For production, move Synapse media storage to S3 or a dedicated NFS mount.

## License Notice

This feature uses open-source components unmodified via Docker:

| Component | Image | License |
|---|---|---|
| Synapse homeserver | `matrixdotorg/synapse:latest` | [AGPL-3.0](https://github.com/element-hq/synapse/blob/develop/LICENSE) |
| Element Web | `vectorim/element-web:latest` | [AGPL-3.0](https://github.com/vector-im/element-web/blob/develop/LICENSE) |
| Synapse Admin | `awesometechnologies/synapse-admin:latest` | [MIT](https://github.com/Awesome-Technologies/synapse-admin/blob/master/LICENSE) |

Running unmodified AGPL-licensed software as a Docker container in an open-source project
does not trigger AGPL copyleft obligations for the host project.

## Troubleshooting

### Bot is not responding

1. Check the bridge logs:
   ```bash
   docker-compose logs epicstaff-matrix-bridge
   ```
2. Verify the bot is registered with Synapse:
   ```bash
   curl -H "Authorization: Bearer ${MATRIX_AS_TOKEN}" \
     "http://localhost/_matrix/client/v3/joined_rooms?user_id=@_epicstaff_flow_my_flow_1:localhost"
   ```
3. Confirm the flow is enabled as a Matrix bot:
   ```bash
   curl http://localhost/api/matrix-bots/?flow=1
   ```

### Synapse health check fails

Wait longer on first start — Synapse needs ~60 seconds to generate signing keys and run
database migrations. Check logs:

```bash
docker-compose logs epicstaff-synapse
```

### Element Web shows "homeserver not found"

Ensure `DOMAIN_NAME` in `.env` matches the domain you're accessing in the browser.
For local development, keep it as `localhost`.

### Flow session not starting

Check that the flow exists and has valid configuration:

```bash
docker-compose logs epicstaff-matrix-bridge | grep "run_session"
docker-compose logs django_app | grep "run-session"
```

Verify the `DJANGO_API_URL` env var in the bridge container resolves to `django_app:8000`.

### Matrix bot dialog not appearing in UI

Ensure the frontend has been rebuilt after the code changes:

```bash
cd frontend && npm run build
# or for development:
cd src && docker-compose build frontend && docker-compose up -d frontend
```
