import asyncio
import json
import os
from datetime import datetime

import pytz
from apscheduler.events import EVENT_JOB_REMOVED
from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.jobstores.base import JobLookupError
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from helpers.logger import logger
from repositories.schedule_trigger_repository import ScheduleTriggerNodeRepository
from services.redis_service import RedisService

SCHEDULE_CHANNEL = "schedule_channel"
TIMEZONE = os.getenv("TIMEZONE", "UTC")
SYNC_RETRY_DELAY = int(os.getenv("SCHEDULE_SYNC_RETRY_DELAY", "5"))


class ScheduleService:
    """APScheduler-based scheduler.

    Fired schedules do not call Django via HTTP — they publish a Redis signal
    on schedule_channel; Django's RedisPubSub routes it to ScheduleTriggerService.
    """

    def __init__(self, redis_service: RedisService):
        self.redis_service = redis_service
        self.repository = ScheduleTriggerNodeRepository()
        self.tz = pytz.timezone(TIMEZONE)

        self.scheduler = AsyncIOScheduler(
            jobstores={"default": MemoryJobStore()},
            executors={"default": AsyncIOExecutor()},
            job_defaults={
                "misfire_grace_time": 30,
                "coalesce": True,
            },
            timezone=self.tz,
        )
        self.scheduler.add_listener(self._on_job_removed, EVENT_JOB_REMOVED)

        self.schedule_nodes: dict[int, str] = {}
        self._manual_removals: set[str] = set()

    async def start(self):
        """Load active schedules, start APScheduler, subscribe to the Redis channel."""
        await self.load_schedules_from_django()
        self.scheduler.start()
        asyncio.create_task(self._start_redis_listener())

    async def load_schedules_from_django(self):
        """Initial sync of active schedules from the DB into APScheduler.

        Retries indefinitely on DB error (repository returns None); an empty
        list is a valid terminal state (no active nodes).
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                active_nodes = await self.repository.get_all_active_schedule_nodes()
                if active_nodes is None:
                    raise RuntimeError("Repository returned None (DB unreachable)")

                for node_data in active_nodes:
                    await self.add_schedule(node_data)

                logger.info(
                    f"[ScheduleService] DB sync completed "
                    f"(attempt {attempt}, nodes loaded: {len(active_nodes)})"
                )
                return
            except Exception as exc:
                logger.warning(
                    f"[ScheduleService] DB sync failed (attempt {attempt}): {exc}. "
                    f"Retrying in {SYNC_RETRY_DELAY}s..."
                )
                await asyncio.sleep(SYNC_RETRY_DELAY)

    async def add_schedule(self, node_data: dict):
        """Register (or replace) an APScheduler job for a schedule node."""
        node_id = node_data["id"]
        node_tz = self._resolve_tz(node_data.get("timezone"))
        trigger = self._build_trigger(node_data, node_tz)

        if trigger is None:
            logger.warning(
                f"[ScheduleService] Could not build trigger for node {node_id}"
            )
            return

        start_dt = self._parse_dt(node_data.get("start_date_time"))
        now = datetime.now(node_tz)

        next_run_time = start_dt if (start_dt and start_dt > now) else None

        job_id = f"schedule_{node_id}"
        # replace_existing=True triggers EVENT_JOB_REMOVED for the old Job —
        # suppress it by marking as a manual removal.
        if node_id in self.schedule_nodes:
            self._manual_removals.add(job_id)
        self.schedule_nodes[node_id] = job_id

        try:
            self.scheduler.add_job(
                func=self.execute_schedule,
                trigger=trigger,
                id=job_id,
                args=[node_data],
                replace_existing=True,
                next_run_time=next_run_time,
                name=f"ScheduleNode-{node_id}",
            )
            logger.info(
                f"[ScheduleService] Job registered for node {node_id} "
                f"(next_run={next_run_time or 'immediate'})"
            )
        except Exception:
            logger.exception(
                f"[ScheduleService] Error registering Job for node {node_id}"
            )
            self._manual_removals.discard(job_id)

    def _on_job_removed(self, event):
        """APScheduler EVENT_JOB_REMOVED handler.

        Manual removals (remove_schedule / replace_existing) are pre-marked in
        _manual_removals and skipped. Auto-removals (end_date reached,
        DateTrigger fired) publish 'deactivate' so Django flips is_active.
        """
        job_id = event.job_id

        if job_id in self._manual_removals:
            self._manual_removals.discard(job_id)
            return

        node_id = next(
            (nid for nid, jid in self.schedule_nodes.items() if jid == job_id),
            None,
        )
        if node_id is None:
            return

        self.schedule_nodes.pop(node_id, None)
        logger.info(
            f"[ScheduleService] Job {job_id} auto-removed by APScheduler "
            f"(end_date reached or run_date passed). "
            f"Publishing 'deactivate' for node {node_id}."
        )
        asyncio.create_task(self._publish_deactivate(node_id))

    async def _publish_deactivate(self, node_id: int):
        """Publish a 'deactivate' signal so Django flips is_active=False."""
        try:
            await self.redis_service.async_publish(
                SCHEDULE_CHANNEL,
                {"action": "deactivate", "node_id": node_id},
            )
        except Exception:
            logger.exception(
                f"[ScheduleService] Error publishing 'deactivate' for node {node_id}"
            )

    async def remove_schedule(self, node_id: int):
        """Remove the APScheduler job for a node (idempotent if already gone)."""
        job_id = self.schedule_nodes.pop(node_id, None)
        if not job_id:
            logger.debug(
                f"[ScheduleService] No tracked job for node {node_id} (already removed)"
            )
            return

        self._manual_removals.add(job_id)
        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"[ScheduleService] Job {job_id} removed")
        except JobLookupError:
            logger.debug(
                f"[ScheduleService] Job {job_id} was already removed by APScheduler"
            )
            self._manual_removals.discard(job_id)
        except Exception:
            logger.exception(f"[ScheduleService] Error removing Job {job_id}")
            self._manual_removals.discard(job_id)

    async def execute_schedule(self, node_data: dict):
        """APScheduler callback. Forward the fire event to Django via Redis.

        All business logic (guards, current_runs) lives Django-side in
        ScheduleTriggerService. For run_mode="once" also publishes 'deactivate'.
        """
        node_id = node_data["id"]
        logger.info(f"[ScheduleService] Executing schedule for node {node_id}")

        try:
            await self.redis_service.async_publish(
                SCHEDULE_CHANNEL,
                {"action": "run_session", "node_id": node_id},
            )
            logger.info(f"[ScheduleService] Published 'run_session' for node {node_id}")

            if node_data.get("run_mode") == "once":
                await self.redis_service.async_publish(
                    SCHEDULE_CHANNEL,
                    {"action": "deactivate", "node_id": node_id},
                )
                logger.info(
                    f"[ScheduleService] Node {node_id} (once): "
                    f"published 'deactivate' (Job will be removed by listener + APScheduler)."
                )

        except Exception:
            logger.exception(
                f"[ScheduleService] Error executing schedule for node {node_id}"
            )

    def _resolve_tz(self, name: str | None):
        """Return a pytz tz for the given IANA name, falling back to server tz."""
        if not name:
            return self.tz
        try:
            return pytz.timezone(name)
        except pytz.UnknownTimeZoneError:
            logger.warning(
                f"[ScheduleService] Unknown tz {name!r}, falling back to server tz"
            )
            return self.tz

    def _local_start(self, node_data: dict, tz):
        """start_date_time (UTC in DB) converted into the node's tz, or None."""
        dt = self._parse_dt(node_data.get("start_date_time"))
        if dt is None:
            return None
        return dt.astimezone(tz)

    _WEEKDAY_SHORT = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

    def _build_trigger(self, node_data: dict, node_tz=None):
        """Build an APScheduler trigger from node data.

        Two semantics, picked per (unit, weekdays, every):

        * Pure interval (delta from start_date_time): seconds / minutes / hours
          regardless of `every`, and days/weeks with every>1 and no weekdays.
          Implemented via IntervalTrigger anchored at start_date_time, so e.g.
          "every 2 minutes from 19:01" fires at 19:01, 19:03, 19:05, ...

        * Calendar-aligned (wall-clock H:M of start_date_time): days every=1,
          days with weekdays, weeks (every value), months. Implemented via
          CronTrigger, so e.g. "Mon at 9am" or "every day at 9am" fire at
          exactly that wall-clock time in the node's tz.

        run_mode="once" → DateTrigger. Returns None on missing/invalid config.
        """
        if node_tz is None:
            node_tz = self._resolve_tz(node_data.get("timezone"))
        run_mode = node_data["run_mode"]

        end_dt = None
        if node_data.get("end_type") == "on_date":
            end_dt = self._parse_dt(node_data.get("end_date_time"))

        start_dt = self._parse_dt(node_data["start_date_time"])

        if run_mode == "once":
            if start_dt is None:
                return None
            return DateTrigger(run_date=start_dt, timezone=node_tz)

        every = node_data.get("every")
        unit = node_data.get("unit")
        weekdays = node_data.get("weekdays") or []

        if not every or not unit:
            logger.error(
                f"[ScheduleService] Missing every/unit for repeat node {node_data.get('id')}"
            )
            return None

        if unit == "seconds":
            return IntervalTrigger(
                seconds=every, timezone=node_tz, start_date=start_dt, end_date=end_dt
            )
        if unit == "minutes":
            return IntervalTrigger(
                minutes=every, timezone=node_tz, start_date=start_dt, end_date=end_dt
            )
        if unit == "hours":
            return IntervalTrigger(
                hours=every, timezone=node_tz, start_date=start_dt, end_date=end_dt
            )

        local = self._local_start(node_data, node_tz)
        minute = local.minute if local is not None else 0
        hour = local.hour if local is not None else 0
        day = local.day if local is not None else 1

        if unit == "days":
            if weekdays:
                wd = ",".join(weekdays)
                return self._make_cron(
                    f"{minute} {hour} * * {wd}", end_dt=end_dt, tz=node_tz
                )
            if every == 1:
                return self._make_cron(
                    f"{minute} {hour} * * *", end_dt=end_dt, tz=node_tz
                )
            return IntervalTrigger(
                days=every, timezone=node_tz, start_date=start_dt, end_date=end_dt
            )

        if unit == "weeks":
            wd = (
                ",".join(weekdays)
                if weekdays
                else self._WEEKDAY_SHORT[local.weekday() if local is not None else 0]
            )
            if every == 1:
                return self._make_cron(
                    f"{minute} {hour} * * {wd}", end_dt=end_dt, tz=node_tz
                )
            return CronTrigger(
                second="0",
                minute=minute,
                hour=hour,
                day_of_week=wd,
                week=f"*/{every}",
                timezone=node_tz,
                end_date=end_dt,
            )

        if unit == "months":
            return self._make_cron(
                f"{minute} {hour} {day} */{every} *", end_dt=end_dt, tz=node_tz
            )

        logger.error(f"[ScheduleService] Unknown unit: {unit}")
        return None

    def _make_cron(self, crontab: str, end_dt=None, tz=None) -> CronTrigger:
        """Build a CronTrigger from a 5-field crontab with an optional end_date.

        CronTrigger.from_crontab() has no end_date parameter, so the fields are
        parsed manually. second="0" matches crontab's once-per-minute semantics.
        """
        minute, hour, day, month, day_of_week = crontab.split()
        return CronTrigger(
            second="0",
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=tz or self.tz,
            end_date=end_dt,
        )

    def _parse_dt(self, s: str | None) -> datetime | None:
        """Parse an ISO 8601 string into a timezone-aware datetime (or None)."""
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = pytz.UTC.localize(dt)
            return dt
        except (ValueError, AttributeError) as exc:
            logger.error(f"[ScheduleService] Error parsing datetime '{s}': {exc}")
            return None

    async def _start_redis_listener(self):
        """Subscribe to schedule_channel and apply live node updates from Django."""
        pubsub = self.redis_service.aioredis_client.pubsub()
        await pubsub.subscribe(SCHEDULE_CHANNEL)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    action_wrapper = data.get("action")

                    if action_wrapper != "node_update":
                        continue

                    inner = data.get("data", {})
                    inner_action = inner.get("action")
                    node_data = inner.get("node", {})
                    node_id = node_data.get("id")

                    if inner_action in ("create", "update"):
                        if not node_data.get("is_active", True):
                            await self.remove_schedule(node_id)
                        else:
                            await self.add_schedule(node_data)
                            logger.info(
                                f"[ScheduleService] Job updated for node {node_id} "
                                f"(action={inner_action})"
                            )
                    elif inner_action == "delete" and node_id:
                        await self.remove_schedule(node_id)

                except json.JSONDecodeError:
                    logger.warning("[ScheduleService] Received invalid JSON message")
                except Exception:
                    logger.exception("[ScheduleService] Error processing Redis message")

        except Exception:
            logger.exception("[ScheduleService] Error in Redis listener")
        finally:
            await pubsub.unsubscribe(SCHEDULE_CHANNEL)
