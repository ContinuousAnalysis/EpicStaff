import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
    CustomInputComponent,
    DatePickerComponent,
    NumberStepperComponent,
    RadioButtonComponent,
    RoundButtonComponent,
    SelectComponent,
    SelectItem,
    TimePickerComponent,
    ToggleSwitchComponent,
} from '@shared/components';

import {
    ScheduleEndType,
    ScheduleIntervalUnit,
    ScheduleRunMode,
    ScheduleTriggerNodeData,
    WeekdayCode,
} from '../../../../pages/flows-page/components/flow-visual-programming/models/schedule-trigger.model';
import { ScheduleTriggerNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';

@Component({
    standalone: true,
    selector: 'app-schedule-trigger-node-panel',
    imports: [
        ReactiveFormsModule,
        MatIconModule,
        MatTooltipModule,
        CustomInputComponent,
        DatePickerComponent,
        TimePickerComponent,
        RadioButtonComponent,
        SelectComponent,
        NumberStepperComponent,
        RoundButtonComponent,
        ToggleSwitchComponent,
    ],
    templateUrl: 'schedule-trigger-node-panel.component.html',
    styleUrls: ['schedule-trigger-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleTriggerNodePanelComponent extends BaseSidePanel<ScheduleTriggerNodeModel> {
    public override readonly isExpanded = input<boolean>(false);

    private destroyRef = inject(DestroyRef);

    protected submitted = signal(false);

    runMode = signal<string>('once');
    endMode = signal<string>('never');
    startRowError = signal<string>('');
    endRowError = signal<string>('');

    showRepeatFields = computed(() => this.runMode() === 'repeat');
    showEndDateTime = computed(() => this.endMode() === 'on_date');
    showMaxRuns = computed(() => this.endMode() === 'after_n_runs');

    readonly runModeOptions = [
        { label: 'Once', value: 'once' },
        { label: 'Repeat', value: 'repeat' },
    ];

    readonly endModeOptions = [
        { label: 'Never', value: 'never' },
        { label: 'On date', value: 'on_date' },
        { label: 'After N runs', value: 'after_n_runs' },
    ];

    readonly repeatUnitItems: SelectItem[] = [
        { name: 'Minutes', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
        { name: 'Days', value: 'days' },
        { name: 'Weeks', value: 'weeks' },
        { name: 'Months', value: 'months' },
    ];

    readonly weekdays: Array<{ label: string; value: WeekdayCode; tooltip: string }> = [
        { label: 'S', value: 'sun', tooltip: 'Sunday' },
        { label: 'M', value: 'mon', tooltip: 'Monday' },
        { label: 'T', value: 'tue', tooltip: 'Tuesday' },
        { label: 'W', value: 'wed', tooltip: 'Wednesday' },
        { label: 'T', value: 'thu', tooltip: 'Thursday' },
        { label: 'F', value: 'fri', tooltip: 'Friday' },
        { label: 'S', value: 'sat', tooltip: 'Saturday' },
    ];

    repeatDays = signal<WeekdayCode[]>([]);

    toggleDay(value: WeekdayCode): void {
        const current = this.repeatDays();
        this.repeatDays.set(current.includes(value) ? current.filter((d) => d !== value) : [...current, value]);
    }

    public override onSave(): ScheduleTriggerNodeModel | null {
        this.submitted.set(true);

        const startErr = this.computeStartError(this.form.get('start_date')!.value, this.form.get('start_time')!.value);
        this.startRowError.set(startErr);

        const endErr = this.showEndDateTime()
            ? this.computeEndError(this.form.get('end_date')!.value, this.form.get('end_time')!.value)
            : '';
        this.endRowError.set(endErr);

        if (startErr || endErr) {
            return this.node();
        }

        return super.onSave();
    }

    initializeForm(): FormGroup {
        this.submitted.set(false);
        this.startRowError.set('');
        this.endRowError.set('');

        const data = this.node().data;

        // Pre-sync signals so visibility computeds are correct before the template renders.
        // These subscriptions are attached after fb.group(), so we set them manually here.
        this.runMode.set(data.runMode ?? 'once');
        this.endMode.set(data.endType ?? 'never');
        this.repeatDays.set([...(data.weekdays ?? [])]);

        // Initial values are passed directly to fb.group() — Angular does NOT emit
        // valueChanges during construction, so live validators won't fire for loaded data.
        const fg = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            start_date: [this.parseIsoToDate(data.startDateTime)],
            start_time: [this.parseIsoToTime(data.startDateTime)],
            run_mode: [data.runMode ?? 'once'],
            repeat_every: [data.intervalEvery ?? 1],
            repeat_unit: [data.intervalUnit ?? 'hours'],
            end_mode: [data.endType ?? 'never'],
            end_date: [this.parseIsoToDate(data.endDateTime ?? '')],
            end_time: [this.parseIsoToTime(data.endDateTime ?? '')],
            max_runs: [data.maxRuns ?? null],
            is_active: [data.isActive ?? true],
        });

        fg.get('run_mode')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((v) => this.runMode.set(v ?? 'once'));

        fg.get('end_mode')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((v) => this.endMode.set(v ?? 'never'));

        const validateStart = () => {
            this.startRowError.set(this.computeStartError(fg.get('start_date')!.value, fg.get('start_time')!.value));
        };
        fg.get('start_date')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateStart);
        fg.get('start_time')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateStart);

        const validateEnd = () => {
            if (this.showEndDateTime()) {
                this.endRowError.set(this.computeEndError(fg.get('end_date')!.value, fg.get('end_time')!.value));
            }
        };
        fg.get('end_date')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateEnd);
        fg.get('end_time')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateEnd);

        return fg;
    }

    /** ISO-8601 (with Z or offset) → "dd.mm.yyyy". Returns '' for empty/invalid input. */
    private parseIsoToDate(iso: string): string {
        if (!iso) return '';
        const dt = new Date(iso);
        if (isNaN(dt.getTime())) return '';
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
    }

    /** ISO-8601 (with Z or offset) → "HH:MM AM/PM". Returns '' for empty/invalid input. */
    private parseIsoToTime(iso: string): string {
        if (!iso) return '';
        const dt = new Date(iso);
        if (isNaN(dt.getTime())) return '';
        let h = dt.getHours();
        const min = dt.getMinutes();
        const meridiem: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(min)} ${meridiem}`;
    }

    private computeStartError(dateVal: string | null, timeVal: string | null): string {
        const date = dateVal ?? '';
        const time = timeVal ?? '';

        if (this.submitted()) {
            if (!time && !date) return 'Start time and date are required';
            if (!time) return 'Start time is required';
            if (!date) return 'Start date is required';
        }

        if (!date || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return '';

        const d = parseInt(date.slice(0, 2), 10);
        const m = parseInt(date.slice(3, 5), 10) - 1;
        const y = parseInt(date.slice(6), 10);
        const parsed = new Date(y, m, d);
        if (parsed.getFullYear() !== y || parsed.getMonth() !== m || parsed.getDate() !== d) {
            return 'Invalid start date';
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (parsed.getTime() < today.getTime()) {
            return 'Start date cannot be in the past';
        }

        if (parsed.getTime() === today.getTime() && time) {
            const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (match) {
                let h = parseInt(match[1], 10);
                const min = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && h !== 12) h += 12;
                else if (ampm === 'AM' && h === 12) h = 0;
                const now = new Date();
                if (h < now.getHours() || (h === now.getHours() && min <= now.getMinutes())) {
                    return 'Start time cannot be in the past for today';
                }
            }
        }

        return '';
    }

    private computeEndError(dateVal: string | null, timeVal: string | null): string {
        const date = dateVal ?? '';
        const time = timeVal ?? '';

        if (this.submitted()) {
            if (!time && !date) return 'End time and date are required';
            if (!time) return 'End time is required';
            if (!date) return 'End date is required';
        }

        if (!date || !/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return '';

        const d = parseInt(date.slice(0, 2), 10);
        const m = parseInt(date.slice(3, 5), 10) - 1;
        const y = parseInt(date.slice(6), 10);
        const parsed = new Date(y, m, d);
        if (parsed.getFullYear() !== y || parsed.getMonth() !== m || parsed.getDate() !== d) {
            return 'Invalid end date';
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (parsed.getTime() < today.getTime()) {
            return 'End date cannot be in the past';
        }

        if (parsed.getTime() === today.getTime() && time) {
            const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
            if (match) {
                let h = parseInt(match[1], 10);
                const min = parseInt(match[2], 10);
                const ampm = match[3].toUpperCase();
                if (ampm === 'PM' && h !== 12) h += 12;
                else if (ampm === 'AM' && h === 12) h = 0;
                const now = new Date();
                if (h < now.getHours() || (h === now.getHours() && min <= now.getMinutes())) {
                    return 'End time cannot be in the past for today';
                }
            }
        }

        return '';
    }

    createUpdatedNode(): ScheduleTriggerNodeModel {
        const f = this.form.value;
        const runMode: ScheduleRunMode = f.run_mode === 'repeat' ? 'repeat' : 'once';
        const endType: ScheduleEndType = runMode === 'once' ? 'never' : this.normalizeEndType(f.end_mode);

        let intervalEvery: number | null = null;
        let intervalUnit: ScheduleIntervalUnit | null = null;
        let weekdays: WeekdayCode[] = [];
        let endDateTime: string | null = null;
        let maxRuns: number | null = null;

        if (runMode === 'repeat') {
            intervalEvery = f.repeat_every ?? null;
            intervalUnit = (f.repeat_unit as ScheduleIntervalUnit) ?? null;
            const unitAllowsWeekdays = intervalUnit === 'days' || intervalUnit === 'weeks';
            weekdays = unitAllowsWeekdays ? [...this.repeatDays()] : [];

            if (endType === 'on_date') {
                endDateTime = this.buildDateTimeString(f.end_date ?? '', f.end_time ?? '');
            } else if (endType === 'after_n_runs') {
                maxRuns = f.max_runs ?? null;
            }
        }

        const data: ScheduleTriggerNodeData = {
            isActive: f.is_active ?? true,
            runMode,
            startDateTime: this.buildDateTimeString(f.start_date ?? '', f.start_time ?? ''),
            intervalEvery,
            intervalUnit,
            weekdays,
            endType,
            endDateTime,
            maxRuns,
            currentRuns: this.node().data.currentRuns ?? 0,
        };

        return {
            ...this.node(),
            node_name: f.node_name ?? this.node().node_name,
            data,
        };
    }

    private normalizeEndType(raw: string | null | undefined): ScheduleEndType {
        if (raw === 'on_date') return 'on_date';
        if (raw === 'after_n_runs' || raw === 'after_runs') return 'after_n_runs';
        return 'never';
    }

    /**
     * Combines "dd.mm.yyyy" date and "HH:MM AM/PM" time into an ISO-8601 string
     * with the browser's local UTC offset (e.g. "2026-04-22T23:35:00+03:00").
     * TODO: confirm timezone strategy with backend before release.
     */
    private buildDateTimeString(date: string, time: string): string {
        if (!date || !time) return '';

        const dateMatch = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!dateMatch || !timeMatch) return '';

        const d = parseInt(dateMatch[1], 10);
        const m = parseInt(dateMatch[2], 10) - 1;
        const y = parseInt(dateMatch[3], 10);
        let h = parseInt(timeMatch[1], 10);
        const min = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3].toUpperCase();

        if (ampm === 'PM' && h !== 12) h += 12;
        else if (ampm === 'AM' && h === 12) h = 0;

        const dt = new Date(y, m, d, h, min, 0, 0);
        if (isNaN(dt.getTime())) return '';

        const pad = (n: number) => String(n).padStart(2, '0');
        const offsetMin = dt.getTimezoneOffset();
        const sign = offsetMin <= 0 ? '+' : '-';
        const absOffset = Math.abs(offsetMin);

        return (
            `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` +
            `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00` +
            `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
        );
    }
}
