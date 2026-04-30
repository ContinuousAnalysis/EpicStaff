from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, tzinfo

from apscheduler.triggers.base import BaseTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from src.shared.models import ScheduleTriggerNodePayload
from utils.timezone_utils import ensure_aware


@dataclass(frozen=True)
class TriggerContext:
    node: ScheduleTriggerNodePayload
    node_tz: tzinfo
    start_dt: datetime | None
    end_dt: datetime | None
    every: int
    weekdays: list[str]


class TriggerStrategy(ABC):
    _WEEKDAY_SHORT = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

    @staticmethod
    def _extract_start_clock(ctx: TriggerContext) -> tuple[int, int, int, int]:
        """(minute, hour, day, weekday) of start_date_time in ctx.node_tz; (0,0,1,0) fallback."""
        dt = ensure_aware(ctx.node.start_date_time)
        if dt is None:
            return 0, 0, 1, 0
        local = dt.astimezone(ctx.node_tz)
        return local.minute, local.hour, local.day, local.weekday()

    @staticmethod
    def _build_cron_trigger(ctx: TriggerContext, crontab: str) -> CronTrigger:
        """5-field crontab + ctx end_date / tz. second='0' matches once-per-minute semantics."""
        minute, hour, day, month, day_of_week = crontab.split()
        return CronTrigger(
            second="0",
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=ctx.node_tz,
            end_date=ctx.end_dt,
        )

    @abstractmethod
    def build(self, ctx: TriggerContext) -> BaseTrigger | None: ...


class OnceTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger | None:
        if ctx.start_dt is None:
            return None
        return DateTrigger(run_date=ctx.start_dt, timezone=ctx.node_tz)


class SecondsTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        return IntervalTrigger(
            seconds=ctx.every,
            timezone=ctx.node_tz,
            start_date=ctx.start_dt,
            end_date=ctx.end_dt,
        )


class MinutesTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        return IntervalTrigger(
            minutes=ctx.every,
            timezone=ctx.node_tz,
            start_date=ctx.start_dt,
            end_date=ctx.end_dt,
        )


class HoursTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        return IntervalTrigger(
            hours=ctx.every,
            timezone=ctx.node_tz,
            start_date=ctx.start_dt,
            end_date=ctx.end_dt,
        )


class DaysTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        minute, hour, _day, _wd = self._extract_start_clock(ctx)
        if ctx.weekdays:
            return self._build_cron_trigger(
                ctx, f"{minute} {hour} * * {','.join(ctx.weekdays)}"
            )
        if ctx.every == 1:
            return self._build_cron_trigger(ctx, f"{minute} {hour} * * *")
        return IntervalTrigger(
            days=ctx.every,
            timezone=ctx.node_tz,
            start_date=ctx.start_dt,
            end_date=ctx.end_dt,
        )


class WeeksTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        minute, hour, _day, weekday = self._extract_start_clock(ctx)
        wd = ",".join(ctx.weekdays) if ctx.weekdays else self._WEEKDAY_SHORT[weekday]
        if ctx.every == 1:
            return self._build_cron_trigger(ctx, f"{minute} {hour} * * {wd}")
        return CronTrigger(
            second="0",
            minute=minute,
            hour=hour,
            day_of_week=wd,
            week=f"*/{ctx.every}",
            timezone=ctx.node_tz,
            end_date=ctx.end_dt,
        )


class MonthsTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        minute, hour, day, _wd = self._extract_start_clock(ctx)
        return self._build_cron_trigger(ctx, f"{minute} {hour} {day} */{ctx.every} *")


ONCE_STRATEGY: TriggerStrategy = OnceTriggerStrategy()

UNIT_STRATEGIES: dict[str, TriggerStrategy] = {
    "seconds": SecondsTriggerStrategy(),
    "minutes": MinutesTriggerStrategy(),
    "hours": HoursTriggerStrategy(),
    "days": DaysTriggerStrategy(),
    "weeks": WeeksTriggerStrategy(),
    "months": MonthsTriggerStrategy(),
}
