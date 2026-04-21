from tables.exceptions import ScheduleTriggerValidationError
from tables.models.graph_models import ScheduleTriggerNode


class ScheduleTriggerValidator:
    def validate(self, attrs: dict) -> None:
        run_mode = attrs.get('run_mode')
        every = attrs.get('every')
        unit = attrs.get('unit')
        end_type = attrs.get('end_type')
        weekdays = attrs.get('weekdays') or []
        end_dt = attrs.get('end_date_time')
        max_runs = attrs.get('max_runs')

        if run_mode == ScheduleTriggerNode.RunMode.ONCE:
            if every is not None or unit is not None:
                raise ScheduleTriggerValidationError(
                    {'every': 'Fields every/unit are not used for run_mode="once".'}
                )

        if run_mode == ScheduleTriggerNode.RunMode.REPEAT:
            if every is None or every < 1:
                raise ScheduleTriggerValidationError(
                    {'every': 'Must be >= 1 for run_mode="repeat".'}
                )

        if end_type == ScheduleTriggerNode.EndType.AFTER_N_RUNS:
            if max_runs is None or max_runs < 1:
                raise ScheduleTriggerValidationError(
                    {'max_runs': 'Required and must be >= 1 for end_type="after_n_runs".'}
                )

        if end_type == ScheduleTriggerNode.EndType.ON_DATE and not end_dt:
            raise ScheduleTriggerValidationError(
                {'end_date_time': 'Required for end_type="on_date".'}
            )

        if weekdays and not set(weekdays).issubset(ScheduleTriggerNode.ALLOWED_WEEKDAYS):
            raise ScheduleTriggerValidationError(
                {'weekdays': f'Allowed values: {", ".join(sorted(ScheduleTriggerNode.ALLOWED_WEEKDAYS))}.'}
            )
