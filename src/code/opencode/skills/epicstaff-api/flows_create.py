"""Flow create operations — create new flows, nodes, edges, and metadata."""

import sys
import json
import uuid

from common import api_get, api_post, api_patch, _get_graph

# Vertical gap between stacked nodes
_NODE_STACK_GAP = 60


def _auto_position(existing_nodes, x=None, y=None):
    """Compute position for a new node.

    If x/y are provided, use them directly.
    Otherwise, place below the lowest node at the rightmost x position
    (i.e. append to the last logical step).
    """
    if x is not None and y is not None:
        return {"x": x, "y": y}

    if not existing_nodes:
        return {"x": 0, "y": 0}

    positions = []
    for n in existing_nodes:
        pos = n.get("position", {})
        px, py = pos.get("x"), pos.get("y")
        if px is not None and py is not None:
            positions.append((px, py))

    if not positions:
        return {"x": 0, "y": 0}

    if x is not None:
        # x given, auto y: stack below lowest node at that x
        same_x = [py for px, py in positions if abs(px - x) < 50]
        if same_x:
            return {"x": x, "y": max(same_x) + _NODE_STACK_GAP}
        return {"x": x, "y": 0}

    if y is not None:
        # y given, auto x: place at rightmost x
        max_x = max(px for px, _ in positions)
        return {"x": max_x, "y": y}

    # Both auto: stack below lowest node at the rightmost x column
    max_x = max(px for px, _ in positions)
    same_col = [py for px, py in positions if abs(px - max_x) < 50]
    max_y = max(same_col) if same_col else 0
    return {"x": max_x, "y": max_y + _NODE_STACK_GAP}


def cmd_create_flow(args):
    """Create a new flow (graph) with a start node."""
    payload = {
        "name": args.name,
        "description": getattr(args, "description", ""),
    }
    result = api_post("/graphs/", payload)
    gid = result.get("id")
    print(f"Created flow: [{gid}] {result.get('name')}")

    # Create a start node (every flow needs one)
    start_payload = {
        "node_name": "__start__",
        "graph": gid,
        "variables": {"$schema": "start"},
    }
    start_result = api_post("/startnodes/", start_payload)
    start_id = start_result.get("id")
    print(f"  Created start node (id={start_id})")

    # Initialize metadata with start node
    start_uuid = str(uuid.uuid4())
    metadata = {
        "nodes": [{
            "id": start_uuid,
            "data": {},
            "icon": "ti ti-player-play-filled",
            "size": {"width": 125, "height": 60},
            "type": "start",
            "color": "#d3d3d3",
            "ports": None,
            "category": "web",
            "parentId": None,
            "position": {"x": -400, "y": 0},
            "input_map": {},
            "node_name": "__start__",
            "output_variable_path": None,
        }],
        "groups": [],
        "connections": [],
    }
    api_patch(f"/graphs/{gid}/", {"metadata": metadata})
    print(f"  Metadata initialized with start node.")
    return result


def cmd_create_start_node(args):
    """Create a start node in a flow (every flow needs one)."""
    graph_id = args.graph_id

    start_payload = {
        "node_name": "__start__",
        "graph": graph_id,
        "variables": {"$schema": "start"},
    }
    result = api_post("/startnodes/", start_payload)
    start_id = result.get("id")
    print(f"Created start node (id={start_id}) in flow {graph_id}")

    # Add to metadata
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    nodes = metadata.setdefault("nodes", [])

    position = _auto_position(
        nodes,
        x=getattr(args, "x", None) if getattr(args, "x", None) is not None else -800,
        y=getattr(args, "y", None) if getattr(args, "y", None) is not None else 0,
    )

    start_uuid = str(uuid.uuid4())
    nodes.insert(0, {
        "id": start_uuid,
        "data": {},
        "icon": "ti ti-player-play-filled",
        "size": {"width": 125, "height": 60},
        "type": "start",
        "color": "#d3d3d3",
        "ports": None,
        "category": "web",
        "parentId": None,
        "position": position,
        "input_map": {},
        "node_name": "__start__",
        "output_variable_path": None,
    })
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"  Position: x={position['x']}, y={position['y']}")
    print(f"  Metadata updated.")
    return result


def cmd_create_node(args):
    """Create a Python node in a flow."""
    graph_id = args.graph_id
    node_name = args.node_name
    code = ""
    if getattr(args, "code_file", None):
        with open(args.code_file) as f:
            code = f.read()

    payload = {
        "node_name": node_name,
        "graph": graph_id,
        "python_code": {"code": code, "libraries": []},
    }
    result = api_post("/pythonnodes/", payload)
    node_id = result.get("id")
    print(f"Created Python node '{node_name}' (id={node_id}) in flow {graph_id}")

    # Compute position
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    existing_nodes = metadata.get("nodes", [])
    position = _auto_position(
        existing_nodes,
        x=getattr(args, "x", None),
        y=getattr(args, "y", None),
    )

    # Add to graph metadata so the UI sees it
    nodes = metadata.setdefault("nodes", [])
    nodes.append({
        "node_name": node_name,
        "type": "pythonNode",
        "position": position,
        "data": {
            "name": node_name,
            "label": node_name,
            "code": code,
        },
    })
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"  Position: x={position['x']}, y={position['y']}")
    print(f"  Metadata updated.")
    return result


def cmd_create_code_agent_node(args):
    """Create a Code Agent node in a flow."""
    graph_id = args.graph_id
    node_name = args.node_name

    stream_handler_code = ""
    if getattr(args, "code_file", None):
        with open(args.code_file) as f:
            stream_handler_code = f.read()

    libraries = []
    if getattr(args, "libraries", None):
        libraries = [lib.strip() for lib in args.libraries.split(",") if lib.strip()]

    payload = {
        "node_name": node_name,
        "graph": graph_id,
        "agent_mode": getattr(args, "agent_mode", None) or "build",
        "system_prompt": getattr(args, "system_prompt", None) or "",
        "stream_handler_code": stream_handler_code,
        "libraries": libraries,
        "polling_interval_ms": getattr(args, "polling_interval_ms", None) or 1000,
        "chunk_timeout_s": getattr(args, "chunk_timeout_s", None) or 30,
        "inactivity_timeout_s": getattr(args, "inactivity_timeout_s", None) or 120,
        "max_wait_s": getattr(args, "max_wait_s", None) or 300,
        "input_map": {},
        "output_variable_path": getattr(args, "output_variable_path", None),
    }

    # LLM config
    llm_config_id = getattr(args, "llm_config", None)
    if llm_config_id:
        payload["llm_config"] = int(llm_config_id)

    result = api_post("/code-agent-nodes/", payload)
    node_id = result.get("id")
    print(f"Created Code Agent node '{node_name}' (id={node_id}) in flow {graph_id}")

    # Compute position and update metadata
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    existing_nodes = metadata.get("nodes", [])
    position = _auto_position(
        existing_nodes,
        x=getattr(args, "x", None),
        y=getattr(args, "y", None),
    )

    nodes = metadata.setdefault("nodes", [])
    nodes.append({
        "node_name": node_name,
        "type": "code-agent",
        "position": position,
        "data": {
            "llm_config_id": payload.get("llm_config"),
            "agent_mode": payload["agent_mode"],
            "system_prompt": payload["system_prompt"],
            "stream_handler_code": stream_handler_code,
            "libraries": libraries,
            "polling_interval_ms": payload["polling_interval_ms"],
            "silence_indicator_s": 3,
            "indicator_repeat_s": 5,
            "chunk_timeout_s": payload["chunk_timeout_s"],
            "inactivity_timeout_s": payload["inactivity_timeout_s"],
            "max_wait_s": payload["max_wait_s"],
        },
    })
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"  Position: x={position['x']}, y={position['y']}")
    print(f"  Agent mode: {payload['agent_mode']}")
    if llm_config_id:
        print(f"  LLM config: {llm_config_id}")
    print(f"  Metadata updated.")
    return result


def cmd_create_webhook(args):
    """Create a Webhook Trigger node in a flow."""
    graph_id = args.graph_id
    node_name = args.node_name
    code = ""
    if getattr(args, "code_file", None):
        with open(args.code_file) as f:
            code = f.read()

    libraries = []
    if getattr(args, "libraries", None):
        libraries = [lib.strip() for lib in args.libraries.split(",") if lib.strip()]

    webhook_path = getattr(args, "webhook_path", None) or "default"

    payload = {
        "node_name": node_name,
        "graph": graph_id,
        "python_code": {"code": code, "libraries": libraries},
        "webhook_trigger_path": webhook_path,
    }
    result = api_post("/webhook-trigger-nodes/", payload)
    node_id = result.get("id")
    print(f"Created Webhook node '{node_name}' (id={node_id}) in flow {graph_id}")
    print(f"  webhook_trigger_path: {webhook_path}")

    # Compute position and update metadata
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    existing_nodes = metadata.get("nodes", [])
    position = _auto_position(
        existing_nodes,
        x=getattr(args, "x", None),
        y=getattr(args, "y", None),
    )

    nodes = metadata.setdefault("nodes", [])
    nodes.append({
        "node_name": node_name,
        "type": "webhook-trigger",
        "position": position,
        "data": {
            "python_code": {
                "code": code,
                "name": "Webhook trigger Node",
                "libraries": libraries,
                "entrypoint": "main",
            },
            "webhook_trigger": 0,
            "webhook_trigger_path": webhook_path,
        },
    })
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"  Position: x={position['x']}, y={position['y']}")
    print(f"  Metadata updated.")
    return result


def cmd_create_note(args):
    """Add a note to a flow's canvas. Notes are metadata-only (no DB record)."""
    graph_id = args.graph_id
    text = args.text
    graph = api_get(f"/graphs/{graph_id}/")
    metadata = graph.get("metadata", {})
    nodes = metadata.setdefault("nodes", [])

    # Position near a target node if specified, otherwise auto-place
    near = getattr(args, "near", None)
    x = getattr(args, "x", None)
    y = getattr(args, "y", None)

    if near:
        for n in nodes:
            if n.get("node_name", "").lower() == near.lower():
                pos = n.get("position", {})
                x = x if x is not None else pos.get("x", 0)
                y = y if y is not None else pos.get("y", 0) + 120
                break

    if x is None:
        x = 0
    if y is None:
        y = 300

    color = getattr(args, "color", "#ffffd1") or "#ffffd1"
    note_id = str(uuid.uuid4())

    # Auto-name: Note (#N)
    existing_notes = [n for n in nodes if n.get("type") == "note"]
    note_num = len(existing_notes) + 1
    node_name = f"Note (#{note_num})"

    nodes.append({
        "id": note_id,
        "data": {"content": text, "backgroundColor": color},
        "icon": "ti ti-note",
        "size": {"width": 200, "height": 150},
        "type": "note",
        "color": color,
        "ports": None,
        "category": "web",
        "parentId": None,
        "position": {"x": x, "y": y},
        "input_map": {},
        "node_name": node_name,
        "output_variable_path": None,
    })

    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"Created {node_name} at x={x}, y={y}")
    print(f"  Text: {text[:80]}{'...' if len(text) > 80 else ''}")


def cmd_create_edge(args):
    """Create an edge between two nodes in a flow."""
    graph_id = args.graph_id
    result = api_post("/edges/", {
        "start_key": args.start_node,
        "end_key": args.end_node,
        "graph": graph_id,
    })
    eid = result.get("id")
    print(f"Created edge {eid}: {args.start_node} \u2192 {args.end_node}")
    return result


# Node type to port suffix mapping
_PORT_MAP = {
    "start": ("start-start", None),
    "python": ("python-out", "python-in"),
    "webhook-trigger": ("webhook-trigger-out", None),
    "telegram-trigger": ("telegram-trigger-out", None),
    "classification-decision-table": ("cdt-out", "cdt-in"),
    "project": ("project-out", "project-in"),
    "code-agent": ("code-agent-out", "code-agent-in"),
}

# UI rendering defaults per node type
_NODE_DEFAULTS = {
    "start": {
        "icon": "ti ti-player-play-filled",
        "size": {"width": 125, "height": 60},
        "color": "#d3d3d3",
    },
    "python": {
        "icon": "ti ti-brand-python",
        "size": {"width": 330, "height": 60},
        "color": "#ffcf3f",
    },
    "webhook-trigger": {
        "icon": "ti ti-world",
        "size": {"width": 330, "height": 60},
        "color": "#21f367ff",
    },
    "telegram-trigger": {
        "icon": "ti ti-brand-telegram",
        "size": {"width": 330, "height": 60},
        "color": "#2aabee",
    },
    "classification-decision-table": {
        "icon": "ti ti-table",
        "size": {"width": 330, "height": 60},
        "color": "#a78bfa",
    },
    "project": {
        "icon": "ti ti-users",
        "size": {"width": 330, "height": 60},
        "color": "#60a5fa",
    },
    "code-agent": {
        "icon": "ti ti-terminal-2",
        "size": {"width": 330, "height": 60},
        "color": "#00e676",
    },
}


def _parse_input_map(code):
    """Extract main() function parameters from Python code and build input_map.

    Maps each parameter (except **kwargs) to variables.<param_name>.
    Skips 'self' and **kwargs-style params.
    """
    import re
    input_map = {}
    # Find the main() function definition — may span multiple lines
    match = re.search(r'def\s+main\s*\((.*?)\)\s*[-:]', code, re.DOTALL)
    if not match:
        return input_map
    params_str = match.group(1)
    # Split on commas, handling defaults and type hints
    for param in params_str.split(','):
        param = param.strip()
        if not param or param.startswith('**') or param.startswith('*'):
            continue
        # Extract just the parameter name (before : or =)
        name = re.split(r'[=:\s]', param)[0].strip()
        if name and name != 'self':
            input_map[name] = f"variables.{name}"
    return input_map


def _build_node_data(db_node, meta_type):
    """Build the metadata 'data' dict from a DB node, matching the UI format."""
    if meta_type == "start":
        return {"initialState": db_node.get("variables", {})}
    elif meta_type == "python":
        pc = db_node.get("python_code", {})
        return {
            "code": pc.get("code", ""),
            "name": db_node.get("node_name", ""),
            "db_id": pc.get("id"),
            "label": db_node.get("node_name", ""),
            "libraries": pc.get("libraries", []),
            "entrypoint": "main",
        }
    elif meta_type == "webhook-trigger":
        pc = db_node.get("python_code", {})
        return {
            "python_code": {
                "code": pc.get("code", ""),
                "name": "Webhook trigger Node",
                "libraries": pc.get("libraries", []),
                "entrypoint": "main",
            },
            "webhook_trigger": 0,
            "webhook_trigger_path": db_node.get("webhook_trigger_path", "default"),
        }
    elif meta_type == "telegram-trigger":
        return {"name": db_node.get("node_name", "")}
    elif meta_type == "classification-decision-table":
        return {"name": db_node.get("node_name", "")}
    elif meta_type == "project":
        crew = db_node.get("crew") or {}
        crew_id = crew.get("id") if isinstance(crew, dict) else crew
        return {"id": crew_id, "name": db_node.get("node_name", "")}
    elif meta_type == "code-agent":
        return {
            "llm_config_id": db_node.get("llm_config"),
            "agent_mode": db_node.get("agent_mode", "build"),
            "system_prompt": db_node.get("system_prompt", ""),
            "stream_handler_code": db_node.get("stream_handler_code", ""),
            "libraries": db_node.get("libraries", []),
            "polling_interval_ms": db_node.get("polling_interval_ms", 1000),
            "silence_indicator_s": db_node.get("silence_indicator_s", 3),
            "indicator_repeat_s": db_node.get("indicator_repeat_s", 5),
            "chunk_timeout_s": db_node.get("chunk_timeout_s", 30),
            "inactivity_timeout_s": db_node.get("inactivity_timeout_s", 120),
            "max_wait_s": db_node.get("max_wait_s", 300),
        }
    return {"name": db_node.get("node_name", "")}


def cmd_init_metadata(args):
    """Generate metadata (node positions + connections) from DB state.

    Reads all nodes and edges from the DB, assigns positions using
    auto-layout, and creates metadata connections matching the edges.
    Existing metadata is replaced.
    """
    graph_id = args.graph_id
    graph = api_get(f"/graphs/{graph_id}/")

    # Collect all nodes by name with full DB data
    node_info = {}  # name -> {type, uuid, db_node}
    type_lists = [
        ("start_node_list", "start"),
        ("python_node_list", "python"),
        ("webhook_trigger_node_list", "webhook-trigger"),
        ("telegram_trigger_node_list", "telegram-trigger"),
        ("classification_decision_table_node_list", "classification-decision-table"),
        ("crew_node_list", "project"),
        ("code_agent_node_list", "code-agent"),
    ]

    for list_key, meta_type in type_lists:
        for n in graph.get(list_key, []):
            name = n.get("node_name", "")
            nid = str(uuid.uuid4())
            node_info[name] = {"type": meta_type, "uuid": nid, "db_node": n}

    if not node_info:
        print("No nodes found in flow.")
        return

    # Auto-layout: arrange nodes left-to-right following edge order
    edges = graph.get("edge_list", [])
    placed = {}
    step_x = -400
    step_gap = 400

    # BFS-ish: start from nodes that have no incoming edges
    targets = {e.get("end_key") for e in edges}
    roots = [n for n in node_info if n not in targets or n == "__start__"]

    # Place __start__ first, then stack trigger roots below it in the same column
    trigger_types = {"webhook-trigger", "telegram-trigger"}
    trigger_roots = [n for n in roots if n != "__start__" and node_info[n]["type"] in trigger_types]
    other_roots = [n for n in roots if n != "__start__" and node_info[n]["type"] not in trigger_types]

    y_slot = 0
    if "__start__" in node_info:
        placed["__start__"] = {"x": step_x, "y": 0}
        y_slot = 1
    for name in trigger_roots:
        placed[name] = {"x": step_x, "y": y_slot * _NODE_STACK_GAP}
        y_slot += 1
    for i, name in enumerate(other_roots):
        root_x = step_x + step_gap if ("__start__" in node_info or trigger_roots) else step_x
        placed[name] = {"x": root_x, "y": i * _NODE_STACK_GAP}

    # Walk edges to place remaining nodes
    remaining = [n for n in node_info if n not in placed and n != "__end__"]
    for _ in range(10):
        if not remaining:
            break
        for e in edges:
            src = e.get("start_key")
            tgt = e.get("end_key")
            if tgt == "__end__":
                continue
            if src in placed and tgt not in placed and tgt in node_info:
                src_x = placed[src]["x"]
                same_step = [n for n, p in placed.items() if p["x"] == src_x + step_gap]
                y = len(same_step) * _NODE_STACK_GAP
                placed[tgt] = {"x": src_x + step_gap, "y": y}
        remaining = [n for n in node_info if n not in placed and n != "__end__"]

    # Place any still unplaced nodes
    max_x = max((p["x"] for p in placed.values()), default=0)
    for name in remaining:
        max_x += step_gap
        placed[name] = {"x": max_x, "y": 0}

    # Build metadata nodes with full UI structure
    meta_nodes = []
    for name, info in node_info.items():
        pos = placed.get(name, {"x": 0, "y": 0})
        defaults = _NODE_DEFAULTS.get(info["type"], _NODE_DEFAULTS["python"])
        data = _build_node_data(info["db_node"], info["type"])

        # input_map: prefer DB value, fall back to auto-parse for Python nodes
        db_input_map = info["db_node"].get("input_map") or {}
        if not db_input_map and info["type"] == "python":
            code = info["db_node"].get("python_code", {}).get("code", "")
            db_input_map = _parse_input_map(code)

        # output_variable_path: prefer DB value, default to "variables" for Python nodes
        db_ovp = info["db_node"].get("output_variable_path")
        if db_ovp is None and info["type"] == "python":
            db_ovp = "variables"

        meta_nodes.append({
            "id": info["uuid"],
            "data": data,
            "icon": defaults["icon"],
            "size": defaults["size"],
            "type": info["type"],
            "color": defaults["color"],
            "ports": None,
            "category": "web",
            "parentId": None,
            "position": pos,
            "input_map": db_input_map,
            "node_name": name,
            "output_variable_path": db_ovp,
        })

    # Build metadata connections from edges
    connections = []
    for e in edges:
        src_name = e.get("start_key")
        tgt_name = e.get("end_key")
        if tgt_name == "__end__" or src_name not in node_info or tgt_name not in node_info:
            continue
        src_info = node_info[src_name]
        tgt_info = node_info[tgt_name]
        src_port_suffix = _PORT_MAP.get(src_info["type"], ("out", "in"))[0]
        tgt_port_suffix = _PORT_MAP.get(tgt_info["type"], ("out", "in"))[1] or "in"
        src_port = f"{src_info['uuid']}_{src_port_suffix}"
        tgt_port = f"{tgt_info['uuid']}_{tgt_port_suffix}"
        connections.append({
            "id": f"{src_port}+{tgt_port}",
            "type": "segment",
            "behavior": "fixed",
            "category": "default",
            "sourceNodeId": src_info["uuid"],
            "sourcePortId": src_port,
            "targetNodeId": tgt_info["uuid"],
            "targetPortId": tgt_port,
        })

    metadata = {"nodes": meta_nodes, "connections": connections, "edges": [], "groups": []}
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"Initialized metadata for flow {graph_id}:")
    print(f"  {len(meta_nodes)} nodes, {len(connections)} connections")
    for n in meta_nodes:
        pos = n["position"]
        print(f"    {n['type']:30s} {n['node_name']:30s} x={pos['x']:>6} y={pos['y']:>6}")
