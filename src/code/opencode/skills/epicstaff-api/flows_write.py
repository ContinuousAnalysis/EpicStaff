"""Flow write operations: push, pull, patch, sync, rename, and OpenCode abort."""

import json
import sys
import time
from pathlib import Path

from common import (
    api_get, api_post, api_patch, _get_graph, _get_cdt_nodes, _get_pn_nodes, _get_wh_nodes,
    _flows_dir, _normalize_slug, _match_node, _discover_files,
    _read_value, _oc_curl,
    SLUG_TO_CDT_NAME, SLUG_TO_PN_NAME, SLUG_TO_WH_NAME,
)


# ═══════════════════════════════════════════════════════════════════════════
# Push / Pull
# ═══════════════════════════════════════════════════════════════════════════

def _push_cdt(spec, content, graph_id):
    node = _match_node(spec.slug, _get_cdt_nodes(graph_id), SLUG_TO_CDT_NAME)
    if not node:
        print(f"  ❌ {Path(spec.path).name}: CDT not found for slug '{spec.slug}'")
        return False
    node_id, node_name = node["id"], node["node_name"]
    if spec.field == "condition_groups":
        clean = [{k: v for k, v in g.items()
                  if k not in ("id", "classification_decision_table_node")} for g in content]
        db_payload = {"condition_groups": clean}
    elif spec.field == "prompts":
        if isinstance(content, list):
            d = {}
            for p in content:
                p = dict(p)
                pid = p.pop("prompt_id", p.pop("id", f"prompt_{len(d)}"))
                d[pid] = p
            content = d
        db_payload = {"prompts": content}
    else:
        db_payload = {spec.field: content}
    api_patch(f"/classification-decision-table-node/{node_id}/", db_payload)

    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name and "table" in n.get("data", {}):
            table = n["data"]["table"]
            if spec.field == "pre_computation_code":
                table.setdefault("pre_computation", {})["code"] = content
            elif spec.field == "post_computation_code":
                table.setdefault("post_computation", {})["code"] = content
            elif spec.field == "condition_groups":
                table["condition_groups"] = content
            elif spec.field == "prompts":
                table["prompts"] = content
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            break
    print(f"  ✅ {Path(spec.path).name} → CDT '{node_name}' .{spec.field}  [DB+Meta]")
    return True


def _push_python(spec, content, graph_id):
    node = _match_node(spec.slug, _get_pn_nodes(graph_id), SLUG_TO_PN_NAME)
    if not node:
        print(f"  ❌ {Path(spec.path).name}: Python node not found for slug '{spec.slug}'")
        return False
    node_id = node["id"]
    node_name = node.get("node_name", "?")
    libs = (node.get("python_code", {}) or {}).get("libraries", "")
    api_patch(f"/pythonnodes/{node_id}/", {"python_code": {"code": content, "libraries": libs}})

    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name and n.get("type", "").startswith("python"):
            n.get("data", {})["code"] = content
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            break
    print(f"  ✅ {Path(spec.path).name} → Python '{node_name}'  [DB+Meta]")
    return True


def _push_webhook(spec, content, graph_id):
    node = _match_node(spec.slug, _get_wh_nodes(graph_id), SLUG_TO_WH_NAME)
    if not node:
        print(f"  ❌ {Path(spec.path).name}: Webhook node not found for slug '{spec.slug}'")
        return False
    node_id = node["id"]
    node_name = node.get("node_name", "?")
    libs = (node.get("python_code", {}) or {}).get("libraries", [])
    api_patch(f"/webhook-trigger-nodes/{node_id}/", {"python_code": {"code": content, "libraries": libs}})

    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name and "webhook" in n.get("type", ""):
            n.get("data", {})["code"] = content
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            break
    print(f"  ✅ {Path(spec.path).name} → Webhook '{node_name}'  [DB+Meta]")
    return True


def cmd_push(args):
    """Push file(s) to DB + metadata."""
    specs = _discover_files(args.path)
    if not specs:
        print(f"No recognized files in: {args.path}")
        sys.exit(1)
    print(f"Pushing {len(specs)} file(s) to flow {args.graph_id}:\n")
    ok, fail = 0, 0
    for spec in specs:
        try:
            with open(spec.path) as f:
                raw = f.read()
            content = json.loads(raw) if spec.field in ("condition_groups", "prompts") else raw
            if spec.kind == "cdt":
                success = _push_cdt(spec, content, args.graph_id)
            elif spec.kind == "webhook":
                success = _push_webhook(spec, content, args.graph_id)
            else:
                success = _push_python(spec, content, args.graph_id)
            if success:
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  ❌ {Path(spec.path).name}: {e}")
            fail += 1
    print(f"\nDone: {ok} pushed, {fail} failed.")
    if fail:
        sys.exit(1)


def cmd_pull(args):
    """Pull DB state into local files.

    Uses the graph's embedded node lists (python_node_list, etc.) rather than
    separate API endpoints, which can return cross-graph nodes.
    """
    outdir = Path(args.path) if args.path else _flows_dir(args.graph_id)
    outdir.mkdir(parents=True, exist_ok=True)
    graph = _get_graph(args.graph_id)
    cdts = graph.get("classification_decision_table_node_list", [])
    pns = graph.get("python_node_list", [])
    whs = graph.get("webhook_trigger_node_list", [])
    count = 0
    print(f"Pulling from flow {args.graph_id} into {outdir}/\n")
    for node in cdts:
        name = node["node_name"]
        slug = _normalize_slug(name.replace("(", "").replace(")", "").replace("#", "").replace("  ", " "))
        for stage in ("pre", "post"):
            code = node.get(f"{stage}_computation_code") or ""
            if code.strip():
                p = outdir / f"cdt_{slug}_{stage}.py"
                p.write_text(code)
                print(f"  {p.name} ({len(code)} chars)")
                count += 1
        groups = node.get("condition_groups", [])
        if groups:
            p = outdir / f"cdt_{slug}_groups.json"
            clean = [{k: v for k, v in g.items()
                      if k not in ("id", "classification_decision_table_node")} for g in groups]
            p.write_text(json.dumps(clean, indent=2))
            print(f"  {p.name} ({len(groups)} groups)")
            count += 1
        prompts = node.get("prompts", {})
        if prompts:
            p = outdir / f"cdt_{slug}_prompts.json"
            p.write_text(json.dumps(prompts, indent=2))
            print(f"  {p.name} ({len(prompts)} prompts)")
            count += 1
    for node in pns:
        name = node.get("node_name", "?")
        slug = _normalize_slug(name.replace("(", "").replace(")", "").replace("#", "").replace("  ", " "))
        pc = node.get("python_code", {})
        code = pc.get("code", "") if isinstance(pc, dict) else ""
        if code.strip():
            p = outdir / f"node_{slug}.py"
            p.write_text(code)
            print(f"  {p.name} ({len(code)} chars)")
            count += 1
    for node in whs:
        name = node.get("node_name", "?")
        slug = _normalize_slug(name.replace("(", "").replace(")", "").replace("#", "").replace("  ", " "))
        pc = node.get("python_code", {})
        code = pc.get("code", "") if isinstance(pc, dict) else ""
        if code.strip():
            p = outdir / f"webhook_{slug}.py"
            p.write_text(code)
            print(f"  {p.name} ({len(code)} chars)")
            count += 1
    print(f"\nPulled {count} files.")


# ═══════════════════════════════════════════════════════════════════════════
# Patching
# ═══════════════════════════════════════════════════════════════════════════

def _sync_cdt_metadata(graph_id, node_name, field, value):
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name and "table" in n.get("data", {}):
            table = n["data"]["table"]
            if field == "pre_computation_code":
                table.setdefault("pre_computation", {})["code"] = value
            elif field == "post_computation_code":
                table.setdefault("post_computation", {})["code"] = value
            elif field == "pre_input_map":
                table.setdefault("pre_computation", {})["input_map"] = value
                table["pre_input_map"] = value
            elif field == "post_input_map":
                table.setdefault("post_computation", {})["input_map"] = value
                table["post_input_map"] = value
            elif field == "condition_groups":
                table["condition_groups"] = value
            elif field == "prompts":
                table["prompts"] = value
            else:
                table[field] = value
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata — '{node_name}' synced.")
            return
    print(f"  Warning: '{node_name}' not found in metadata.")


def cmd_patch_cdt(args):
    """Patch a CDT field (DB + metadata)."""
    node_name = args.node_name
    field = args.field
    graph_id = args.graph_id
    value = _read_value(args)
    try:
        value = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        pass
    cdts = _get_cdt_nodes(graph_id)
    matches = [c for c in cdts if c["node_name"] == node_name]
    if not matches:
        print(f"Error: CDT '{node_name}' not found in flow {graph_id}.", file=sys.stderr)
        sys.exit(1)
    cdt_id = matches[0]["id"]
    print(f"PATCHing CDT '{node_name}' (id={cdt_id}), field='{field}'")
    result = api_patch(f"/classification-decision-table-node/{cdt_id}/", {field: value})
    print(f"  DB updated.")
    _sync_cdt_metadata(graph_id, node_name, field, value)


def cmd_patch_python(args):
    """Patch Python node code (DB + metadata)."""
    graph_id = args.graph_id
    node_name = args.node_name
    value = _read_value(args)
    graph = _get_graph(graph_id)
    py_nodes = graph.get("python_node_list", [])
    db_node = None
    for pn in py_nodes:
        if pn.get("node_name") == node_name:
            db_node = pn
            break
    if not db_node:
        print(f"Python node '{node_name}' not found in flow {graph_id}")
        sys.exit(1)
    node_id = db_node["id"]
    libs = (db_node.get("python_code", {}) or {}).get("libraries", "")
    print(f"PATCHing Python node '{node_name}' (id={node_id})")
    api_patch(f"/pythonnodes/{node_id}/", {"python_code": {"code": value, "libraries": libs}})
    print(f"  DB updated.")
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name:
            n.get("data", {})["code"] = value
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata synced.")
            return
    print(f"  Warning: '{node_name}' not found in metadata.")


def cmd_patch_webhook(args):
    """Patch webhook node code (DB + metadata)."""
    graph_id = args.graph_id
    node_name = args.node_name
    value = _read_value(args)
    graph = _get_graph(graph_id)
    wh_nodes = graph.get("webhook_trigger_node_list", [])
    db_node = None
    for wn in wh_nodes:
        if wn.get("node_name") == node_name:
            db_node = wn
            break
    if not db_node:
        print(f"Webhook node '{node_name}' not found in flow {graph_id}")
        sys.exit(1)
    node_id = db_node["id"]
    libs = (db_node.get("python_code", {}) or {}).get("libraries", [])
    print(f"PATCHing Webhook node '{node_name}' (id={node_id})")
    api_patch(f"/webhook-trigger-nodes/{node_id}/", {"python_code": {"code": value, "libraries": libs}})
    print(f"  DB updated.")
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        nn = n.get("node_name", n.get("data", {}).get("name", ""))
        if nn == node_name and "webhook" in n.get("type", ""):
            data = n.get("data", {})
            data["code"] = value
            if "python_code" in data:
                data["python_code"]["code"] = value
            else:
                data["python_code"] = {"code": value, "name": "Python Code", "entrypoint": "main", "libraries": libs}
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata synced (data.code + data.python_code.code).")
            return
    print(f"  Warning: '{node_name}' not found in webhook metadata.")


def cmd_patch_code_agent(args):
    """Patch Code Agent node stream handler code (DB + metadata)."""
    graph_id = args.graph_id
    node_name = args.node_name
    value = _read_value(args)
    graph = _get_graph(graph_id)
    ca_nodes = graph.get("code_agent_node_list", [])
    db_node = None
    for cn in ca_nodes:
        if cn.get("node_name") == node_name:
            db_node = cn
            break
    if not db_node:
        print(f"Code Agent node '{node_name}' not found in flow {graph_id}", file=sys.stderr)
        sys.exit(1)
    node_id = db_node["id"]
    print(f"PATCHing Code Agent node '{node_name}' (id={node_id})")
    api_patch(f"/code-agent-nodes/{node_id}/", {"stream_handler_code": value})
    print(f"  DB updated.")
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        if n.get("node_name") == node_name:
            n.get("data", {})["stream_handler_code"] = value
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata synced.")
            return
    print(f"  Warning: '{node_name}' not found in metadata.")


def cmd_patch_libraries(args):
    """Patch libraries on a Python node (DB + metadata)."""
    graph_id = args.graph_id
    node_name = args.node_name
    libs = [l.strip() for l in args.libraries.split(",") if l.strip()]
    graph = _get_graph(graph_id)
    py_nodes = graph.get("python_node_list", [])
    db_node = None
    for pn in py_nodes:
        if pn.get("node_name") == node_name:
            db_node = pn
            break
    if not db_node:
        print(f"Python node '{node_name}' not found in flow {graph_id}", file=sys.stderr)
        sys.exit(1)
    node_id = db_node["id"]
    code = (db_node.get("python_code", {}) or {}).get("code", "")
    api_patch(f"/pythonnodes/{node_id}/", {"python_code": {"code": code, "libraries": libs}})
    print(f"DB node {node_id} libraries: {libs}")
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        if n.get("node_name") == node_name:
            n.get("data", {})["libraries"] = libs
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata synced.")
            return
    print(f"  Warning: '{node_name}' not found in metadata.")


def cmd_patch_node_meta(args):
    """Patch metadata fields on a node (input_map, output_variable_path)."""
    graph_id = args.graph_id
    node_name = args.node_name
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    target = None
    for n in metadata.get("nodes", []):
        if n.get("node_name") == node_name:
            target = n
            break
    if not target:
        print(f"Node '{node_name}' not found in metadata for flow {graph_id}", file=sys.stderr)
        sys.exit(1)
    if getattr(args, "input_map", None):
        target["input_map"] = json.loads(args.input_map)
        print(f"  input_map set: {target['input_map']}")
    if getattr(args, "output_variable_path", None):
        target["output_variable_path"] = args.output_variable_path
        print(f"  output_variable_path set: {args.output_variable_path}")
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"Metadata updated for '{node_name}'.")


def cmd_patch_start_vars(args):
    """Set start node variables (PATCH). Use --replace to overwrite entirely."""
    graph_id = args.graph_id
    graph = _get_graph(graph_id)
    start_nodes = graph.get("start_node_list", [])
    if not start_nodes:
        print(f"No start node in flow {graph_id}", file=sys.stderr)
        sys.exit(1)
    start = start_nodes[0]
    start_id = start["id"]
    new_vars = json.loads(args.variables)
    if getattr(args, "replace", False):
        final = {"$schema": "start"}
        final.update(new_vars)
    else:
        final = start.get("variables", {})
        final.update(new_vars)
    api_patch(f"/startnodes/{start_id}/", {"variables": final})
    print(f"Start node {start_id} variables updated{' (replaced)' if getattr(args, 'replace', False) else ''}.")
    for k, v in final.items():
        vtype = type(v).__name__
        vpreview = str(v)[:80] if not isinstance(v, dict) else f"{{...}} ({len(v)} keys)"
        print(f"  {k}: {vtype} = {vpreview}")
    # Sync metadata initialState
    metadata = graph.get("metadata", {})
    for n in metadata.get("nodes", []):
        if n.get("node_name") == "__start__":
            n.setdefault("data", {})["initialState"] = final
            api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
            print(f"  Metadata initialState synced.")
            break


def cmd_rename_node(args):
    """Rename a Python node (DB + metadata + edges)."""
    graph_id = args.graph_id
    old_name = args.old_name
    new_name = args.new_name
    graph = _get_graph(graph_id)

    py_nodes = graph.get("python_node_list", [])
    db_node = None
    for pn in py_nodes:
        if pn.get("node_name") == old_name:
            db_node = pn
            break
    if not db_node:
        print(f"Python node '{old_name}' not found in flow {graph_id}", file=sys.stderr)
        sys.exit(1)
    node_id = db_node["id"]
    api_patch(f"/pythonnodes/{node_id}/", {"node_name": new_name})
    print(f"  DB node {node_id}: '{old_name}' → '{new_name}'")

    metadata = graph.get("metadata", {})
    meta_updated = False
    for n in metadata.get("nodes", []):
        nd = n.get("data", {})
        nn = n.get("node_name", nd.get("name", ""))
        if nn == old_name or nd.get("label") == old_name:
            n["node_name"] = new_name
            nd["label"] = new_name
            nd["name"] = new_name
            meta_updated = True
            break
    if meta_updated:
        api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
        print(f"  Metadata: label/name updated")
    else:
        print(f"  Warning: '{old_name}' not found in metadata")

    edges = api_get("/edges/", {"graph": graph_id})
    edge_count = 0
    for e in edges:
        patch = {}
        if e.get("start_key") == old_name:
            patch["start_key"] = new_name
        if e.get("end_key") == old_name:
            patch["end_key"] = new_name
        if patch:
            api_patch(f"/edges/{e['id']}/", patch)
            edge_count += 1
            start = patch.get("start_key", e["start_key"])
            end = patch.get("end_key", e["end_key"])
            print(f"  Edge {e['id']}: {start} → {end}")
    if edge_count == 0:
        print(f"  No edges referenced '{old_name}'")
    print(f"\nRenamed '{old_name}' → '{new_name}' ({1 + (1 if meta_updated else 0) + edge_count} updates)")


def cmd_sync_metadata(args):
    """Sync CDT code from DB into graph metadata."""
    graph_id = args.graph_id
    graph = _get_graph(graph_id)
    metadata = graph.get("metadata", {})
    nodes = metadata.get("nodes", [])
    cdts = _get_cdt_nodes(graph_id)
    cdt_by_name = {c["node_name"]: c for c in cdts}
    updated = []
    for n in nodes:
        nd = n.get("data", {})
        table = nd.get("table", {})
        pre_comp = table.get("pre_computation")
        post_comp = table.get("post_computation")
        if pre_comp is None and post_comp is None:
            continue
        label = n.get("node_name", nd.get("name", ""))
        cdt = cdt_by_name.get(label)
        if not cdt:
            continue
        changed = False
        for comp, prefix in [(pre_comp, "pre"), (post_comp, "post")]:
            if comp is None:
                continue
            for sub in ("code", "input_map", "output_variable_path"):
                db_key = f"{prefix}_computation_code" if sub == "code" else f"{prefix}_{sub}"
                db_val = cdt.get(db_key)
                if db_val is None:
                    db_val = "" if sub == "code" else ({} if sub == "input_map" else "")
                if comp.get(sub) != db_val:
                    comp[sub] = db_val
                    changed = True
        if changed:
            updated.append(label)
    if not updated:
        print("Metadata already in sync.")
        return
    api_patch(f"/graphs/{graph_id}/", {"metadata": metadata})
    print(f"Metadata updated for: {', '.join(updated)}")


# ═══════════════════════════════════════════════════════════════════════════
# OpenCode abort
# ═══════════════════════════════════════════════════════════════════════════

def cmd_oc_abort(args):
    """Abort any in-flight request on an OpenCode session."""
    sid = getattr(args, "oc_session_id", None)
    if not sid:
        sessions = _oc_curl("/session")
        statuses = _oc_curl("/session/status") or {}
        if not sessions:
            print("No OpenCode sessions.")
            return
        for s in sessions:
            if s.get("title", "").startswith("epicstaff_"):
                st = statuses.get(s["id"], {}).get("type", "idle")
                if st != "idle":
                    sid = s["id"]
                    break
        if not sid:
            print("All epicstaff sessions are idle. Nothing to abort.")
            return
    result = _oc_curl(f"/session/{sid}/abort", method="POST")
    print(f"Abort sent to {sid}: {result}")


# ═══════════════════════════════════════════════════════════════════════════
# Run Session
# ═══════════════════════════════════════════════════════════════════════════

def cmd_run_session(args):
    """Trigger a flow session and poll until it completes or times out."""
    gid = args.graph_id
    timeout = getattr(args, "timeout", 300) or 300
    variables = {}

    var_json = getattr(args, "variables", None)
    if var_json:
        try:
            variables = json.loads(var_json)
        except json.JSONDecodeError:
            print(f"Error: --variables must be valid JSON", file=sys.stderr)
            sys.exit(1)

    print(f"Starting session for flow {gid}...")
    result = api_post("/run-session/", {"graph_id": gid, "variables": variables})
    session_id = result.get("session_id")
    if not session_id:
        print(f"Error: no session_id returned: {result}", file=sys.stderr)
        sys.exit(1)
    print(f"Session {session_id} started. Polling (timeout={timeout}s)...\n")

    poll_interval = 3
    waited = 0
    last_status = None

    while waited < timeout:
        time.sleep(poll_interval)
        waited += poll_interval

        try:
            resp = api_get(f"/sessions/{session_id}/get-updates/")
            status = resp.get("status") if isinstance(resp, dict) else resp
        except Exception as e:
            print(f"  [{waited:>4}s] Poll error: {e}")
            continue

        if status != last_status:
            print(f"  [{waited:>4}s] Status: {status}")
            last_status = status

        if isinstance(status, str) and status.lower() in ("done", "completed", "error", "stopped"):
            break

    print(f"\nSession {session_id} final status: {last_status}")

    # Fetch session details
    try:
        session = api_get(f"/sessions/{session_id}/")
        print(f"  Duration: {session.get('duration', '?')}s")
        if session.get("status_data"):
            print(f"  Status data: {json.dumps(session['status_data'], indent=2)[:500]}")
    except Exception:
        pass

    return session_id
