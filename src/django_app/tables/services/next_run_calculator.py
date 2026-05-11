"""Compute the next fire time of a ScheduleTriggerNode.

Single source of truth for `next_run_date_time`. Called from:
  - ScheduleTriggerService.create_node          (after attrs assigned, before save)
  - ScheduleTriggerService.update_node          (after attrs applied, before save)
  - ScheduleTriggerService.handle_schedule_trigger (after current_runs bumped)
  - implicitly returns None for inactive / unconfigured nodes, so _deactivate
    callers can rely on the same helper if they pass through.

Reads the node's *current in-memory state*, so callers must apply pending
changes BEFORE calling this.
"""

import zoneinfo
from datetime import datetime, timezone as _tz

from src.shared.models import ScheduleTriggerNodePayload
from src.shared.schedule.trigger_builder import build_trigger

from tables.models.graph_models import ScheduleTriggerNode


def compute_next_run_date_time(
    node: ScheduleTriggerNode,
    after: datetime | None = None,
) -> datetime | None:
    """Return the next fire time as a UTC tz-aware datetime, or None.

    Returns None when:
      - the node is not active, or schedule is not configured;
      - run quota is exhausted (current_runs >= max_runs);
      - APScheduler reports no future fire (end_date passed, once-mode in past).
    """
    if not node.is_active or not node.run_mode or not node.start_date_time:
        return None

    if node.max_runs is not None and node.current_runs >= node.max_runs:
        return None

    try:
        tz = zoneinfo.ZoneInfo(node.timezone or "UTC")
    except zoneinfo.ZoneInfoNotFoundError:
        tz = zoneinfo.ZoneInfo("UTC")

    payload = ScheduleTriggerNodePayload.model_validate(node)
    trigger = build_trigger(payload, tz)
    if trigger is None:
        return None

    after_utc = (after or datetime.now(_tz.utc)).astimezone(_tz.utc)
    nxt = trigger.get_next_fire_time(None, after_utc)
    return nxt.astimezone(_tz.utc) if nxt else None
