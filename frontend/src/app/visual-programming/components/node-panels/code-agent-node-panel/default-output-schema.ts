export const DEFAULT_OUTPUT_SCHEMA: Record<string, any> = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EpicChatResponse",
  "description": "Response object for the EpicChat widget. The widget renders a chat bubble from the 'message' field (Markdown supported), and optionally displays interactive tables, action buttons, link buttons, and prompt suggestions. Return ONLY the fields you need — all fields except 'message' are optional. All behavioral instructions for build mode, navigation actions, and interactive elements are documented in $defs.action — read that description carefully.",
  "type": "object",
  "required": ["message"],
  "properties": {
    "message": {
      "type": "string",
      "description": "The main chat reply displayed to the user. Supports full Markdown: headings, bold, italic, code blocks, lists, links, etc. This is the ONLY required field."
    },
    "ef_tables": {
      "type": "array",
      "description": "Interactive data tables displayed below the message. Each table is rendered with sortable columns, optional inline editing, row selection, and CSV/XLSX download buttons. You can provide just 'rows' (columns are auto-detected from keys), or explicitly define 'columns' for full control.",
      "items": {
        "type": "object",
        "required": ["rows"],
        "properties": {
          "rows": {
            "type": "array",
            "description": "Array of data rows. Each row is an object with column keys as properties. Example: [{\"name\": \"Alice\", \"score\": 95}, {\"name\": \"Bob\", \"score\": 72}]",
            "items": {
              "type": "object",
              "additionalProperties": true
            }
          },
          "columns": {
            "type": "array",
            "description": "Explicit column definitions. If omitted, columns are auto-detected from the first row's keys.",
            "items": {
              "type": "object",
              "required": ["key", "title"],
              "properties": {
                "key": { "type": "string", "description": "Property name in row objects." },
                "title": { "type": "string", "description": "Human-readable column header." },
                "visible": { "type": "boolean", "default": true },
                "editable": { "type": "boolean", "default": true },
                "type": { "type": "string", "enum": ["text", "number", "boolean", "date", "default"], "default": "default" }
              }
            }
          },
          "id": { "type": "string", "description": "Unique table identifier." },
          "isEditable": { "type": "boolean", "default": true, "description": "Allow inline cell editing." },
          "isSortable": { "type": "boolean", "default": true },
          "defaultSortField": { "type": "string" },
          "rowsSelectionType": { "type": "string", "enum": ["edit", "select", "multiSelect"], "default": "edit", "description": "'edit' = click to edit cells. 'select' = single row select. 'multiSelect' = multiple row select." },
          "preselectedRows": { "type": "array", "items": { "type": "integer" }, "description": "Zero-based row indices to pre-select." },
          "unions": {
            "type": "array",
            "description": "Column grouping headers.",
            "items": {
              "type": "object",
              "required": ["title", "keys"],
              "properties": {
                "title": { "type": "string" },
                "keys": { "type": "array", "items": { "type": "string" } }
              }
            }
          },
          "tableActions": { "type": "array", "items": { "$ref": "#/$defs/action" } }
        }
      }
    },
    "action_message": {
      "type": "array",
      "description": "Interactive elements: buttons below message (removed after click), links (open URLs), prompts (suggestion chips that send text as next user message).",
      "items": { "$ref": "#/$defs/action" }
    }
  },
  "additionalProperties": true,
  "$defs": {
    "action": {
      "type": "object",
      "required": ["type"],
      "description": "An interactive element: button, link, or prompt suggestion.\n\n## Build Mode\nYou run in plan mode by default (read-only — you can read files, search code, and reason, but CANNOT create or modify files). To make file changes, you MUST first get build permission from the user by including a build mode button in your response.\n\n### CRITICAL — Offering the Button Is MANDATORY Plan-Mode Behavior\nIncluding a build mode button in your JSON response is NOT editing files — it is a read-only output action. You are simply adding a button element to your response JSON. Plan mode restrictions do NOT apply to offering buttons. When the user asks you to create, modify, or delete anything, you MUST:\n1. Outline your plan in the 'message' field.\n2. Estimate how many turns the plan requires.\n3. Include the build mode button in 'action_message'.\n\nNEVER say 'I cannot switch to build mode' or 'I cannot make edits' or 'plan mode prevents me from...' — instead, ALWAYS include the button. The button is how the user grants you permission. Refusing to offer the button is a failure to follow instructions. If you catch yourself about to explain why you 'cannot' do something that requires editing, STOP — offer the build mode button instead.\n\n### Requesting Build Mode\nReturn a button with action 'sendAction' and one of these text values:\n- 'Allow build mode' — grants build permission for 1 turn\n- 'Allow build mode (N turns)' — grants build permission for N turns (e.g. 'Allow build mode (3 turns)')\n\nChoose the turn count based on how many steps your plan requires. Each turn is one agent response. Examples:\n- Simple one-step fix → 'Allow build mode' (1 turn)\n- Multi-step plan (create node, add edge, patch config) → 'Allow build mode (3 turns)'\n\n### Build Mode Rules\n- ALWAYS offer the build mode button when your plan involves creating, editing, or deleting anything — no exceptions.\n- After presenting a plan, include the button so the user can approve with one click.\n- Multi-turn build persists automatically — the flow tracks remaining turns. You do NOT need to re-request.\n- When you receive build permission, proceed immediately with the plan you proposed.\n- If the user asks you to build, create, or modify something, first outline your plan, estimate the turns needed, then offer the button.\n- Err on the side of asking — it is better to offer the button too often than to forget.\n- When multi-turn build is active, you will see a message like 'Build mode continues (N turn(s) remaining)'. Keep executing your plan.\n\n## Navigation Actions\nThe widget supports navigating the user to flows and nodes in the EpicStaff UI:\n- **openFlow**: Opens a flow by ID in the visual programming editor AND automatically refreshes the page cache. Offer this after creating or modifying a flow.\n- **openNode**: Opens a specific node within a flow (expands the node panel) AND automatically refreshes.\n- **refreshCache**: Reloads the page. Use ONLY standalone when the user is already viewing the correct flow.\n\n### Navigation Rules\n- After modifications, offer a SINGLE navigation button (openFlow or openNode). Never add a separate refreshCache alongside them — they already refresh automatically.\n\n## Prompt Suggestions\nUse 'prompt' type elements to suggest follow-up questions or actions. These appear as chips in the input footer. Always offer 2-3 relevant suggestions after completing a task.",
      "properties": {
        "type": { "type": "string", "enum": ["button", "link", "prompt"], "description": "'button' = clickable button. 'link' = hyperlink. 'prompt' = suggestion chip." },
        "text": { "type": "string", "description": "Display label. For 'prompt', also the text sent as next user message. To request build mode, use text 'Allow build mode' (1 turn) or 'Allow build mode (N turns)' for multi-turn." },
        "action": { "type": "string", "description": "Action identifier: 'sendAction', 'link', 'processTables', 'switchAgent', 'openFlow', 'openNode', 'refreshCache'." },
        "params": { "type": "object", "additionalProperties": true, "description": "Extra params. For 'link': {url: '...'}. For 'switchAgent': {flow_id: N}. For 'openFlow': {flowId: N}. For 'openNode': {flowId: N, nodeId: '<uuid>'}." }
      }
    }
  }
};
