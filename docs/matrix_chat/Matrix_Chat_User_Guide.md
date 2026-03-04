# Matrix Chat User Guide

## Feature Overview

The Matrix Chat integration lets you expose any EpicStaff flow as a chat bot on your own
self-hosted [Matrix](https://matrix.org) homeserver. Users open **Element Web** (bundled with
EpicStaff) at `/chat`, start a direct message with the bot, and the flow executes automatically
— the user's message becomes the flow's input variable, and the bot replies with the output
variable once the run completes. No third-party messaging platform account is required; the
entire stack runs inside your existing EpicStaff Docker deployment.

---

## User Workflow — Enabling a Flow as a Bot (builder / admin steps)

1. Ensure the Matrix stack is running (see the
   [Developer Guide](Matrix_Chat_Developer_Guide.md) for environment setup).
2. Open EpicStaff at `http://localhost` and navigate to **Flows**.
3. Hover over the flow card you want to expose → click the **⋮** (three dots) action menu.
4. Select **Matrix Bot**.
5. In the dialog, review or update:
   - **Input Variable** — the flow variable that receives the incoming chat message (default: `message`).
   - **Output Variable** — the flow variable whose value is sent back as the reply (default: `context`).
6. Toggle **Enabled** on and click **Enable**.
7. The dialog now shows the bot's **Matrix User ID**
   (e.g. `@_epicstaff_flow_my_flow_1:localhost`). Share this ID with your end users.

---

## User Workflow — Chatting with the Bot (end-user steps)

1. Open **Element Web** at `http://localhost/chat`.
2. Register a new account (registration is open by default on a fresh deployment).
3. Click **New Direct Message** and search for the bot's Matrix User ID
   (e.g. `@_epicstaff_flow_my_flow_1:localhost`).
4. The bot automatically accepts the invite and joins the room.
5. Type a message and send it.
6. The flow executes with your message as the configured input variable.
7. When the flow finishes, the bot replies with the value of the configured output variable.

---

## Enabling via the UI

1. Open **EpicStaff** at `http://localhost`
2. Navigate to **Flows**
3. Hover over a flow card → click the **⋮** (three dots) action menu
4. Select **Matrix Bot**
5. The dialog shows:
   - **Input Variable** — the flow variable that receives the incoming message (default: `message`)
   - **Output Variable** — the flow variable whose value is sent back as the reply (default: `context`)
   - **Enabled** toggle
6. Click **Enable** to activate the bot

After enabling, the dialog displays the bot's **Matrix User ID**
(e.g. `@_epicstaff_flow_my_flow_1:localhost`).

---

## Starting a Conversation

1. Open Element Web at `http://localhost/chat`
2. Register a new user (registration is open by default)
3. Start a **Direct Message** with the bot user ID, e.g. `@_epicstaff_flow_my_flow_1:localhost`
4. The bot will automatically accept the invite and join the room
5. Send a message — the flow starts executing with your message as the input variable
6. When the flow finishes (status = "end"), the bot replies with the output variable value

---

## Variable Mapping

Each flow bot has two configurable variables:

| Setting | Description | Default |
|---|---|---|
| `input_variable` | The flow variable set to the incoming chat message text | `message` |
| `output_variable` | The flow variable read from when composing the reply | `context` |

**Example**: If your flow has a Start node that seeds `message` and an End node that stores
the result in `context`, the defaults work out of the box.

**Customizing**: If your flow uses different variable names (e.g. `user_input` → `answer`),
update the bot's input/output variable names to match via the Matrix Bot dialog or API.
