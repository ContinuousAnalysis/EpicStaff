# EpicChat Widget — Response Format Reference

How to structure the flow's final output so the EpicChat widget renders it correctly.

The widget calls `convertEpicstaffResponseToEpResponse(output)` on the **last finish message's `output`** (or `status_data.variables.final_result` if present). The output is a flat JSON object; recognized top-level keys are listed below.

---

## 1. Message Text

```json
{
  "message": "Your reply here. **Markdown** is supported."
}
```

- **Key**: `message` (string)
- Rendered as the main chat bubble using **ngx-markdown** (full Markdown: headings, bold, italic, code blocks, lists, links, etc.)
- This is the **minimum required field** for a reply to appear.

---

## 2. Tables (`ef_tables`)

The widget converts `ef_tables` → internal `_tables` format automatically.

### Minimal (rows only — columns auto-detected)

```json
{
  "message": "Here are the results:",
  "ef_tables": [
    {
      "rows": [
        {"name": "Alice", "score": 95, "passed": true},
        {"name": "Bob", "score": 72, "passed": true}
      ]
    }
  ]
}
```

- Columns are inferred from the first row's keys
- Column types auto-detected: `boolean`, `number`, `date`, `text`
- Tables are **editable** and **sortable** by default
- Download buttons (CSV, XLSX) added automatically

### Full (explicit columns + options)

```json
{
  "ef_tables": [
    {
      "columns": [
        {"key": "name", "title": "Name", "visible": true, "editable": false, "type": "text"},
        {"key": "score", "title": "Score", "visible": true, "editable": true, "type": "number"}
      ],
      "rows": [
        {"name": "Alice", "score": 95}
      ],
      "id": "my-table-1",
      "isEditable": true,
      "isSortable": true,
      "defaultSortField": "score",
      "rowsSelectionType": "select",
      "preselectedRows": [0],
      "tableActions": [
        {"text": ".csv", "action": "downloadEpTableCsv", "type": "button"},
        {"text": ".xlsx", "action": "downloadEpTableExcel", "type": "button"}
      ],
      "unions": [
        {"title": "Group A", "keys": ["col1", "col2"]}
      ]
    }
  ]
}
```

### Table options

| Field | Type | Default | Description |
|---|---|---|---|
| `id` | string | auto-generated | Unique table identifier |
| `isEditable` | boolean | `true` | Allow inline cell editing |
| `isSortable` | boolean | `true` | Allow column sorting |
| `defaultSortField` | string | first column | Initial sort column key |
| `rowsSelectionType` | `"select"` \| `"multiSelect"` \| `"edit"` | `"edit"` | Row interaction mode |
| `preselectedRows` | number[] | `[]` | Initially selected row indices |
| `selectedRowIndices` | number[] | `[]` | Currently selected rows (updated by widget) |
| `tableActions` | Action[] | CSV+XLSX buttons | Custom action buttons above the table |
| `unions` | `{title, keys}[]` | `[]` | Column grouping headers |

### Table processing

When the user clicks **"Process tables"** (`processTables` action), the widget sends the table data (including any edits and selected rows) back to the flow as `contextExtras` merged into `variables.context`.

---

## 3. Action Buttons (`action_message`)

```json
{
  "message": "What would you like to do?",
  "action_message": [
    {"type": "button", "action": "sendAction", "text": "Option A"},
    {"type": "button", "action": "sendAction", "text": "Option B"},
    {"type": "link", "action": "link", "text": "Open docs", "params": {"url": "https://example.com"}},
    {"type": "prompt", "text": "Try asking about X"}
  ]
}
```

### Action types

| `type` | Behavior |
|---|---|
| `"button"` | Rendered as clickable buttons below the message. Removed after click. |
| `"link"` | Rendered as clickable links below the message. Opens URL from `params.url`. |
| `"prompt"` | Rendered as suggestion chips in the input footer (last message only). Clicking sends the `text` as a new user message. |

### Built-in action identifiers

| `action` value | Description |
|---|---|
| `"sendAction"` | Sends `text` as `user_action` to the flow |
| `"sendButtonTextWithParams"` | Sends `text` as `user_action` + `params` as context extras |
| `"switchAgent"` | Switches to another flow. `params: {"flow_id": 55, "url": "..."}` |
| `"processTables"` | Sends edited table data back to the flow |
| `"link"` | Opens `params.url` in browser |
| `"downloadEpTableCsv"` | Downloads table as CSV |
| `"downloadEpTableExcel"` | Downloads table as XLSX |
| `"resetTable"` | Reverts table edits to original |
| `"addTokens"` | Placeholder for token purchase (not implemented) |
| `"openFlow"` | Emits app event to open flow designer. `params: {"flowId": 42}` |
| `"openNode"` | Emits app event to open a specific node. `params: {"flowId": 42, "nodeId": 123}` |
| `"refreshCache"` | Emits app event to refresh frontend cache |

### Button sequencing

Multiple buttons with sequential order appear in the same row. Buttons are removed from the message after the user clicks one.

---

## 4. Combined Example

```json
{
  "message": "I found **3 servers** with high CPU usage:",
  "ef_tables": [
    {
      "rows": [
        {"server": "prod-web-01", "cpu": 94.2, "status": "critical"},
        {"server": "prod-api-03", "cpu": 87.1, "status": "warning"},
        {"server": "staging-01", "cpu": 82.5, "status": "warning"}
      ],
      "isEditable": false,
      "rowsSelectionType": "select"
    }
  ],
  "action_message": [
    {"type": "button", "action": "sendButtonTextWithParams", "text": "Restart selected", "params": {"operation": "restart"}},
    {"type": "button", "action": "sendAction", "text": "Show details"},
    {"type": "prompt", "text": "What about memory usage?"}
  ]
}
```

---

## 5. Request Payload (what the flow receives)

When the user sends a message or clicks an action:

```
variables.context.user_input      — user's text message (string)
variables.context.user_action     — action text when button clicked (string)
variables.context.chat_history    — previous messages [{role, content}, ...]
variables.context.user_params     — from widget's userData attribute (object)
variables.context.chat_session_id — persistent session ID (string, if widget sends it)
```

Action-specific context extras (e.g., edited table data from `processTables`) are merged directly into `variables.context`.

---

## 6. Streaming Messages

During execution, the widget displays streaming messages in a **"Thinking..." expander**.

### Recognized stream message types

| `message_type` | Source | Displayed in Thinking |
|---|---|---|
| `code_agent_stream` | Code Agent node | ✅ |
| `crewai_output` | Crew node (wrapper) | ✅ |
| `python_stream` | Python node | ✅ |

Stream messages must have:
```json
{
  "message_type": "crewai_output",
  "text": "Working on your request...",
  "is_final": false,
  "sse_visible": true
}
```

Set `sse_visible: false` (via `stream_config` checkboxes) to hide specific messages from the filtered SSE endpoint.

### `final_reply` stream_config option

When `stream_config.final_reply` is `false`, the finish message is tagged `sse_visible=false` and suppressed on the filtered endpoint — preventing duplicate display when the Thinking expander already showed the response.
