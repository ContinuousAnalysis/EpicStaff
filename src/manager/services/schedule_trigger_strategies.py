from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, tzinfo

import pytz
from apscheduler.triggers.base import BaseTrigger
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from src.shared.models import ScheduleTriggerNodePayload


_WEEKDAY_SHORT = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def ensure_aware(dt: datetime | None) -> datetime | None:
    """Force tz-awareness on a Pydantic-parsed datetime (UTC fallback)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return pytz.UTC.localize(dt)
    return dt


def _local_start(node: ScheduleTriggerNodePayload, tz: tzinfo) -> datetime | None:
    dt = ensure_aware(node.start_date_time)
    if dt is None:
        return None
    return dt.astimezone(tz)


def _local_clock(
    node: ScheduleTriggerNodePayload, node_tz: tzinfo
) -> tuple[int, int, int, int]:
    """(minute, hour, day, weekday) of start_date_time in node tz; (0,0,1,0) fallback."""
    local = _local_start(node, node_tz)
    if local is None:
        return 0, 0, 1, 0
    return local.minute, local.hour, local.day, local.weekday()


def _make_cron(crontab: str, end_dt: datetime | None, tz: tzinfo) -> CronTrigger:
    """5-field crontab + optional end_date. second='0' matches once-per-minute semantics."""
    minute, hour, day, month, day_of_week = crontab.split()
    return CronTrigger(
        second="0",
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone=tz,
        end_date=end_dt,
    )


@dataclass(frozen=True)
class TriggerContext:
    node: ScheduleTriggerNodePayload
    node_tz: tzinfo
    start_dt: datetime | None
    end_dt: datetime | None
    every: int
    weekdays: list[str]


class TriggerStrategy(ABC):
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
        minute, hour, _day, _wd = _local_clock(ctx.node, ctx.node_tz)
        if ctx.weekdays:
            return _make_cron(
                f"{minute} {hour} * * {','.join(ctx.weekdays)}",
                end_dt=ctx.end_dt,
                tz=ctx.node_tz,
            )
        if ctx.every == 1:
            return _make_cron(
                f"{minute} {hour} * * *", end_dt=ctx.end_dt, tz=ctx.node_tz
            )
        return IntervalTrigger(
            days=ctx.every,
            timezone=ctx.node_tz,
            start_date=ctx.start_dt,
            end_date=ctx.end_dt,
        )


class WeeksTriggerStrategy(TriggerStrategy):
    def build(self, ctx: TriggerContext) -> BaseTrigger:
        minute, hour, _day, weekday = _local_clock(ctx.node, ctx.node_tz)
        wd = ",".join(ctx.weekdays) if ctx.weekdays else _WEEKDAY_SHORT[weekday]
        if ctx.every == 1:
            return _make_cron(
                f"{minute} {hour} * * {wd}", end_dt=ctx.end_dt, tz=ctx.node_tz
            )
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
        minute, hour, day, _wd = _local_clock(ctx.node, ctx.node_tz)
        return _make_cron(
            f"{minute} {hour} {day} */{ctx.every} *",
            end_dt=ctx.end_dt,
            tz=ctx.node_tz,
        )


ONCE_STRATEGY: TriggerStrategy = OnceTriggerStrategy()

UNIT_STRATEGIES: dict[str, TriggerStrategy] = {
    "seconds": SecondsTriggerStrategy(),
    "minutes": MinutesTriggerStrategy(),
    "hours": HoursTriggerStrategy(),
    "days": DaysTriggerStrategy(),
    "weeks": WeeksTriggerStrategy(),
    "months": MonthsTriggerStrategy(),
}
