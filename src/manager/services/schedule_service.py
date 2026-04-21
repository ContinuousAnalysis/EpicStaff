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
    """
    Task scheduling service based on APScheduler (AsyncIOScheduler).

    When a schedule fires, Manager does NOT make an HTTP request to Django.
    Instead it publishes a Redis signal {"action": "run_session", "node_id": N}
    to schedule_channel. Django's RedisPubSub receives the signal and calls
    ScheduleTriggerService, which atomically handles all business logic.

    Lifecycle:
      1. start()            — load from DB + start scheduler + Redis listener
      2. add_schedule()     — register a new APScheduler Job
      3. remove_schedule()  — remove Job on node deactivation/deletion
      4. execute_schedule() — callback: publish run_session → Redis → Django
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
        """
        Entry point. Called from app.py on FastAPI startup.

        Process:
            1. Load all active nodes from DB
            2. Start APScheduler
            3. Subscribe to schedule_channel in Redis
        """
        await self.load_schedules_from_django()
        self.scheduler.start()
        asyncio.create_task(self._start_redis_listener())

    async def load_schedules_from_django(self):
        """
        Initial sync: loads active nodes from DB and registers APScheduler Jobs.

        Retries indefinitely every SYNC_RETRY_DELAY seconds if DB is unreachable.
        Distinguishes repository failure (None) from empty result ([]):
          - None  → DB error, retry
          - []    → no active nodes, stop retrying
          - list  → register jobs, stop retrying

        Input:  —
        Output: Jobs registered in self.scheduler once DB sync succeeds
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
        """
        Registers an APScheduler Job for a schedule node.

        Input:
            node_data — dict with node fields (id, run_mode, start_date_time, ...)
        Process:
            1. Parse start_date_time with timezone
            2. Build APScheduler trigger via _build_trigger()
            3. scheduler.add_job(func=execute_schedule, ...)
        Output:
            Job registered in scheduler; self.schedule_nodes updated
        """
        node_id = node_data["id"]
        trigger = self._build_trigger(node_data)

        if trigger is None:
            logger.warning(
                f"[ScheduleService] Could not build trigger for node {node_id}"
            )
            return

        start_dt = self._parse_dt(node_data.get("start_date_time"))
        now = datetime.now(self.tz)

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
        """
        Handler for APScheduler EVENT_JOB_REMOVED.

        Fires on every Job removal — both manual (our remove_schedule / replace_existing)
        and automatic (APScheduler removes the Job when trigger returns None,
        e.g. end_date reached or run_date of DateTrigger has passed).

        Manual removals are pre-marked in self._manual_removals → we skip them.
        Auto-removals publish 'deactivate' so Django marks the node is_active=False.
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
        """Publishes a 'deactivate' signal so Django marks the node is_active=False."""
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
        """
        Removes an APScheduler Job for a schedule node.

        Input:  node_id — node ID
        Output: Job removed from scheduler; self.schedule_nodes updated
        """
        job_id = self.schedule_nodes.pop(node_id, None)
        if not job_id:
            logger.warning(f"[ScheduleService] Job for node {node_id} not found")
            return

        self._manual_removals.add(job_id)
        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"[ScheduleService] Job {job_id} removed")
        except JobLookupError:
            # Already gone — APScheduler auto-removed it (end_date reached,
            # DateTrigger fired once, etc). Idempotent no-op.
            logger.info(
                f"[ScheduleService] Job {job_id} was already removed by APScheduler"
            )
            self._manual_removals.discard(job_id)
        except Exception:
            logger.exception(f"[ScheduleService] Error removing Job {job_id}")
            self._manual_removals.discard(job_id)

    async def execute_schedule(self, node_data: dict):
        """
        APScheduler callback. Called on each schedule fire.

        Input:
            node_data — snapshot of node data at the time the Job was registered.

        Process:
            1. Publish 'run_session' → schedule_channel → Django
               Django receives the signal and calls ScheduleTriggerService.handle_schedule_trigger(),
               which atomically: checks guard conditions + run_session() + increments current_runs.
            2. If node run_mode is 'once' → publish 'deactivate' + remove_schedule()
               (Django sets is_active=False; Manager removes Job from memory)

        Output:
            New session in Django (via Redis → ScheduleTriggerService);
            current_runs atomically incremented on Django side;
            for 'once' — node deactivated and Job removed from APScheduler.
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

    def _build_trigger(self, node_data: dict):
        """
        APScheduler Trigger factory.

        Input:
            node_data — dict with fields: run_mode, start_date_time, end_type,
                        end_date_time, every, unit, weekdays

        Process:
            - once     → DateTrigger(run_date=start_date_time)
            - seconds  → IntervalTrigger(seconds=every, end_date=...)
            - minutes  → CronTrigger("*/every * * * *", end_date=...)
            - hours    → CronTrigger("0 */every * * *", end_date=...)
            - days     → CronTrigger("0 0 */every * *") or with weekdays
            - weeks    → CronTrigger("0 0 * * mon,wed")
            - months   → CronTrigger("0 0 1 */every *")

        Output:
            APScheduler Trigger object or None for unknown unit
        """
        run_mode = node_data["run_mode"]

        end_dt = None
        if node_data.get("end_type") == "on_date":
            end_dt = self._parse_dt(node_data.get("end_date_time"))

        if run_mode == "once":
            dt = self._parse_dt(node_data["start_date_time"])
            if dt is None:
                return None
            return DateTrigger(run_date=dt, timezone=self.tz)

        every = node_data.get("every")
        unit = node_data.get("unit")
        weekdays = node_data.get("weekdays") or []

        if not every or not unit:
            logger.error(
                f"[ScheduleService] Missing every/unit for repeat node {node_data.get('id')}"
            )
            return None

        if unit == "seconds":
            return IntervalTrigger(seconds=every, timezone=self.tz, end_date=end_dt)

        if unit == "minutes":
            return self._make_cron(f"*/{every} * * * *", end_dt=end_dt)

        if unit == "hours":
            return self._make_cron(f"0 */{every} * * *", end_dt=end_dt)

        if unit == "days":
            if weekdays:
                wd = ",".join(weekdays)
                return self._make_cron(f"0 0 * * {wd}", end_dt=end_dt)
            return self._make_cron(f"0 0 */{every} * *", end_dt=end_dt)

        if unit == "weeks":
            wd = ",".join(weekdays) if weekdays else "0"
            return self._make_cron(f"0 0 * * {wd}", end_dt=end_dt)

        if unit == "months":
            return self._make_cron(f"0 0 1 */{every} *", end_dt=end_dt)

        logger.error(f"[ScheduleService] Unknown unit: {unit}")
        return None

    def _make_cron(self, crontab: str, end_dt=None) -> CronTrigger:
        """
        Build CronTrigger from 5-field crontab with optional end_date.

        CronTrigger.from_crontab() doesn't accept end_date, so we parse the
        fields manually and use the constructor directly. second=0 matches
        crontab semantics (fire at second 0 of each matching minute).
        """
        minute, hour, day, month, day_of_week = crontab.split()
        return CronTrigger(
            second="0",
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=self.tz,
            end_date=end_dt,
        )

    def _parse_dt(self, s: str | None) -> datetime | None:
        """
        Parses an ISO 8601 string into a timezone-aware datetime.

        Input:  string like "2025-01-15T09:00:00+03:00" or None
        Output: datetime with tzinfo or None
        """
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = self.tz.localize(dt)
            return dt
        except (ValueError, AttributeError) as exc:
            logger.error(f"[ScheduleService] Error parsing datetime '{s}': {exc}")
            return None

    async def _start_redis_listener(self):
        """
        Subscribes to schedule_channel and handles live node updates from Django.

        Messages format:
        {
          "action": "node_update",
          "data": {
            "action": "create" | "update" | "delete",
            "node": <dict with node fields>
          }
        }
        """
        pubsub = self.redis_service.aioredis_client.pubsub()
        await pubsub.subscribe(SCHEDULE_CHANNEL)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                    action_wrapper = data.get("action")

                    if action_wrapper == "node_update":
                        inner = data.get("data", {})
                        inner_action = inner.get("action")
                        node_data = inner.get("node", {})
                        node_id = node_data.get("id")

                        if inner_action in ("create", "update"):
                            if not node_data.get("is_active", True):
                                await self.remove_schedule(node_id)
                                logger.info(
                                    f"[ScheduleService] Job removed for node {node_id} "
                                    f"(node deactivated)"
                                )
                            else:
                                await self.add_schedule(node_data)
                                logger.info(
                                    f"[ScheduleService] Job updated for node {node_id} "
                                    f"(action={inner_action})"
                                )
                        elif inner_action == "delete" and node_id:
                            await self.remove_schedule(node_id)
                            logger.info(
                                f"[ScheduleService] Job removed for node {node_id}"
                            )

                    elif action_wrapper == "deactivate":
                        node_id = data.get("node_id")
                        if node_id:
                            await self.remove_schedule(node_id)
                            logger.info(
                                f"[ScheduleService] Job removed for node {node_id} "
                                f"(received 'deactivate')"
                            )

                except json.JSONDecodeError:
                    logger.warning("[ScheduleService] Received invalid JSON message")
                except Exception:
                    logger.exception("[ScheduleService] Error processing Redis message")

        except Exception:
            logger.exception("[ScheduleService] Error in Redis listener")
        finally:
            await pubsub.unsubscribe(SCHEDULE_CHANNEL)
