from tables.exceptions import ScheduleTriggerValidationError
from tables.models.graph_models import ScheduleTriggerNode


class ScheduleTriggerValidator:
    _WEEKDAYS_UNITS = {
        ScheduleTriggerNode.TimeUnit.DAYS,
        ScheduleTriggerNode.TimeUnit.WEEKS,
    }

    def validate(self, attrs: dict) -> None:
        run_mode = attrs.get("run_mode")
        every = attrs.get("every")
        unit = attrs.get("unit")
        end_type = attrs.get("end_type")
        weekdays = attrs.get("weekdays") or []
        start_dt = attrs.get("start_date_time")
        end_dt = attrs.get("end_date_time")
        max_runs = attrs.get("max_runs")

        if run_mode == ScheduleTriggerNode.RunMode.ONCE:
            if every is not None or unit is not None or weekdays:
                raise ScheduleTriggerValidationError(
                    {
                        "every": 'Fields every/unit/weekdays are not used for run_mode="once".'
                    }
                )
            if end_type != ScheduleTriggerNode.EndType.NEVER:
                raise ScheduleTriggerValidationError(
                    {"end_type": 'run_mode="once" implies end_type="never".'}
                )

        if run_mode == ScheduleTriggerNode.RunMode.REPEAT:
            if every is None or every < 1:
                raise ScheduleTriggerValidationError(
                    {"every": 'Must be >= 1 for run_mode="repeat".'}
                )
            if unit is None:
                raise ScheduleTriggerValidationError(
                    {"unit": 'Required for run_mode="repeat".'}
                )

        if end_type == ScheduleTriggerNode.EndType.NEVER:
            if end_dt is not None or max_runs is not None:
                raise ScheduleTriggerValidationError(
                    {
                        "end_type": 'end_date_time and max_runs must be empty for end_type="never".'
                    }
                )

        if end_type == ScheduleTriggerNode.EndType.AFTER_N_RUNS:
            if max_runs is None or max_runs < 1:
                raise ScheduleTriggerValidationError(
                    {
                        "max_runs": 'Required and must be >= 1 for end_type="after_n_runs".'
                    }
                )

        if end_type == ScheduleTriggerNode.EndType.ON_DATE:
            if not end_dt:
                raise ScheduleTriggerValidationError(
                    {"end_date_time": 'Required for end_type="on_date".'}
                )
            if start_dt and end_dt <= start_dt:
                raise ScheduleTriggerValidationError(
                    {"end_date_time": "Must be later than start_date_time."}
                )

        if weekdays:
            if not set(weekdays).issubset(ScheduleTriggerNode.ALLOWED_WEEKDAYS):
                raise ScheduleTriggerValidationError(
                    {
                        "weekdays": f'Allowed values: {", ".join(sorted(ScheduleTriggerNode.ALLOWED_WEEKDAYS))}.'
                    }
                )
            if unit is not None and unit not in self._WEEKDAYS_UNITS:
                raise ScheduleTriggerValidationError(
                    {"weekdays": 'Only supported with unit="days" or unit="weeks".'}
                )
