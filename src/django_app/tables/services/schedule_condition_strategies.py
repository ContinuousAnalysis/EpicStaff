from abc import ABC, abstractmethod
from datetime import datetime

from tables.models.graph_models import ScheduleTriggerNode


class EndConditionStrategy(ABC):
    """Termination policy for a ScheduleTriggerNode keyed by EndType.

    Two hooks: pre-run guard (before _start_session) and post-run guard (after
    _increment_runs). Each strategy implements only the checks meaningful for
    its EndType; the rest are no-ops.
    """

    @abstractmethod
    def is_end_date_passed(self, node: ScheduleTriggerNode, now: datetime) -> bool: ...

    @abstractmethod
    def is_run_limit_reached(self, node: ScheduleTriggerNode) -> bool: ...


class NeverEndStrategy(EndConditionStrategy):
    def is_end_date_passed(self, node, now):
        return False

    def is_run_limit_reached(self, node):
        return False


class OnDateEndStrategy(EndConditionStrategy):
    def is_end_date_passed(self, node, now):
        return bool(node.end_date_time and node.end_date_time <= now)

    def is_run_limit_reached(self, node):
        return False


class AfterNRunsEndStrategy(EndConditionStrategy):
    def is_end_date_passed(self, node, now):
        return False

    def is_run_limit_reached(self, node):
        return node.max_runs is not None and node.current_runs >= node.max_runs


_DEFAULT_STRATEGY = NeverEndStrategy()

_END_STRATEGIES: dict[str, EndConditionStrategy] = {
    ScheduleTriggerNode.EndType.NEVER: _DEFAULT_STRATEGY,
    ScheduleTriggerNode.EndType.ON_DATE: OnDateEndStrategy(),
    ScheduleTriggerNode.EndType.AFTER_N_RUNS: AfterNRunsEndStrategy(),
}


def get_end_condition_strategy(end_type: str | None) -> EndConditionStrategy:
    """Look up the strategy for an EndType; unknown/None falls back to NEVER."""
    if end_type is None:
        return _DEFAULT_STRATEGY
    return _END_STRATEGIES.get(end_type, _DEFAULT_STRATEGY)
