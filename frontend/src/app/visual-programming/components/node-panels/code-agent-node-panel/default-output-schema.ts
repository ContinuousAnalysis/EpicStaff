export const DEFAULT_OUTPUT_SCHEMA: Record<string, any> = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EpicChatResponse",
  "description": "Response object for the EpicChat widget. The widget renders a chat bubble from the 'message' field (Markdown supported), and optionally displays interactive tables, action buttons, link buttons, and prompt suggestions. Return ONLY the fields you need — all fields except 'message' are optional.",
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
      "description": "An interactive element: button, link, or prompt suggestion. Build Mode Pattern: The Code Agent runs in 'plan' mode by default (read-only). To create or edit files, it needs 'build' mode. Return a sendAction button with text 'Allow build mode'. When the user clicks it, build permissions are granted automatically for that turn. Navigation Actions: 'openFlow' navigates to a flow in the visual editor (params.flowId). 'openNode' opens a specific node panel (params.flowId + params.nodeId). 'refreshCache' reloads the page — ALWAYS offer after modifying flows/nodes to avoid stale metadata conflicts.",
      "properties": {
        "type": { "type": "string", "enum": ["button", "link", "prompt"], "description": "'button' = clickable button. 'link' = hyperlink. 'prompt' = suggestion chip." },
        "text": { "type": "string", "description": "Display label. For 'prompt', also the text sent as next user message. To request build mode, use text 'Allow build mode'." },
        "action": { "type": "string", "description": "Action identifier: 'sendAction', 'link', 'processTables', 'switchAgent', 'openFlow', 'openNode', 'refreshCache'." },
        "params": { "type": "object", "additionalProperties": true, "description": "Extra params. For 'link': {url: '...'}. For 'switchAgent': {flow_id: N}. For 'openFlow': {flowId: N}. For 'openNode': {flowId: N, nodeId: '<uuid>'}." }
      }
    }
  }
};
