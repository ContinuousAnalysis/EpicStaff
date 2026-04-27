import { animate, style, transition, trigger } from '@angular/animations';
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
    TimezoneSelectorComponent,
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

const panelFadeSlide = trigger('panelFadeSlide', [
    transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-4px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
    ]),
    transition(':leave', [animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-4px)' }))]),
]);

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
        TimezoneSelectorComponent,
        RadioButtonComponent,
        SelectComponent,
        NumberStepperComponent,
        RoundButtonComponent,
        ToggleSwitchComponent,
    ],
    templateUrl: 'schedule-trigger-node-panel.component.html',
    styleUrls: ['schedule-trigger-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [panelFadeSlide],
})
export class ScheduleTriggerNodePanelComponent extends BaseSidePanel<ScheduleTriggerNodeModel> {
    public override readonly isExpanded = input<boolean>(false);

    private destroyRef = inject(DestroyRef);

    protected submitted = signal(false);

    runMode = signal<string>('once');
    endMode = signal<string>('never');
    repeatUnit = signal<string>('hours');
    startRowError = signal<string>('');
    endRowError = signal<string>('');
    timezoneError = signal<string>('');

    showRepeatFields = computed(() => this.runMode() === 'repeat');
    showWeekdays = computed(
        () => this.runMode() === 'repeat' && (this.repeatUnit() === 'days' || this.repeatUnit() === 'weeks')
    );
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
        { name: 'Seconds', value: 'seconds' },
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
    hasStartDateTime = signal(false);
    startDateTimeDirty = signal(false);
    endDateTimeDirty = signal(false);
    scheduleDirty = signal(false);

    toggleDay(value: WeekdayCode): void {
        const current = this.repeatDays();
        this.repeatDays.set(current.includes(value) ? current.filter((d) => d !== value) : [...current, value]);
        this.scheduleDirty.set(true);
    }

    public override onSave(): ScheduleTriggerNodeModel | null {
        if (this.scheduleDirty()) {
            this.submitted.set(true);

            const startErr = this.computeStartError(
                this.form.get('start_date')!.value,
                this.form.get('start_time')!.value
            );
            this.startRowError.set(startErr);

            const endErr = this.showEndDateTime()
                ? this.computeEndError(this.form.get('end_date')!.value, this.form.get('end_time')!.value)
                : '';
            this.endRowError.set(endErr);

            if (startErr || endErr) {
                return null;
            }
        }

        const hasConfiguredDateTime = !!(
            (this.form.get('start_date')!.value ?? '') &&
            (this.form.get('start_time')!.value ?? '')
        );
        const tzErr = hasConfiguredDateTime && !this.form.get('timezone')!.value ? 'Timezone is required' : '';
        this.timezoneError.set(tzErr);
        if (tzErr) return null;

        return super.onSave();
    }

    public override onSaveSilently(): ScheduleTriggerNodeModel | null {
        if (this.scheduleDirty()) {
            this.submitted.set(true);

            const startErr = this.computeStartError(
                this.form.get('start_date')!.value,
                this.form.get('start_time')!.value
            );
            this.startRowError.set(startErr);

            const endErr = this.showEndDateTime()
                ? this.computeEndError(this.form.get('end_date')!.value, this.form.get('end_time')!.value)
                : '';
            this.endRowError.set(endErr);

            if (startErr || endErr) {
                return null;
            }
        }

        const hasConfiguredDateTime = !!(
            (this.form.get('start_date')!.value ?? '') &&
            (this.form.get('start_time')!.value ?? '')
        );
        const tzErr = hasConfiguredDateTime && !this.form.get('timezone')!.value ? 'Timezone is required' : '';
        this.timezoneError.set(tzErr);
        if (tzErr) return null;

        return super.onSaveSilently();
    }

    initializeForm(): FormGroup {
        this.submitted.set(false);
        this.startRowError.set('');
        this.endRowError.set('');
        this.timezoneError.set('');
        this.startDateTimeDirty.set(false);
        this.endDateTimeDirty.set(false);
        this.scheduleDirty.set(false);

        const data = this.node().data;

        const isNewNode = !data.startDateTime;
        const future = isNewNode ? this.defaultFutureDateTime() : null;
        const defaultDate = isNewNode ? this.formatCurrentDate(future!) : this.parseIsoToDate(data.startDateTime);
        const defaultTime = isNewNode ? this.formatCurrentTime(future!) : this.parseIsoToTime(data.startDateTime);

        // Pre-sync signals so visibility computeds are correct before the template renders.
        // These subscriptions are attached after fb.group(), so we set them manually here.
        this.runMode.set(data.runMode ?? 'once');
        this.endMode.set(data.endType ?? 'never');
        this.repeatUnit.set(data.intervalUnit ?? 'hours');
        this.repeatDays.set([...(data.weekdays ?? [])]);
        this.hasStartDateTime.set(isNewNode || !!data.startDateTime);

        // Initial values are passed directly to fb.group() — Angular does NOT emit
        // valueChanges during construction, so live validators won't fire for loaded data.
        const fg = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            start_date: [defaultDate],
            start_time: [defaultTime],
            run_mode: [data.runMode ?? 'once'],
            repeat_every: [data.intervalEvery ?? 1],
            repeat_unit: [data.intervalUnit ?? 'hours'],
            end_mode: [data.endType ?? 'never'],
            end_date: [this.parseIsoToDate(data.endDateTime ?? '')],
            end_time: [this.parseIsoToTime(data.endDateTime ?? '')],
            max_runs: [data.maxRuns ?? null],
            is_active: [isNewNode ? false : (data.isActive ?? true)],
            timezone: [this.resolveTimezone(data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)],
        });

        if (!this.hasStartDateTime()) {
            fg.get('is_active')!.disable({ emitEvent: false });
        }

        fg.get('run_mode')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((v) => this.runMode.set(v ?? 'once'));

        fg.get('end_mode')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((v) => this.endMode.set(v ?? 'never'));

        fg.get('repeat_unit')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((v) => this.repeatUnit.set(v ?? 'hours'));

        fg.get('start_date')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.startDateTimeDirty.set(true));
        fg.get('start_time')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.startDateTimeDirty.set(true));
        fg.get('end_date')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.endDateTimeDirty.set(true));
        fg.get('end_time')!
            .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.endDateTimeDirty.set(true));

        const scheduleFields = [
            'start_date',
            'start_time',
            'run_mode',
            'repeat_every',
            'repeat_unit',
            'end_mode',
            'end_date',
            'end_time',
            'max_runs',
            'is_active',
            'timezone',
        ] as const;
        scheduleFields.forEach((field) => {
            fg.get(field)!
                .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(() => this.scheduleDirty.set(true));
        });

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
        fg.get('start_date')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateEnd);
        fg.get('start_time')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(validateEnd);

        const updateActiveState = () => {
            const d = fg.get('start_date')!.value;
            const t = fg.get('start_time')!.value;
            const has = !!(d && t);
            this.hasStartDateTime.set(has);
            const ctrl = fg.get('is_active')!;
            if (!has) {
                ctrl.setValue(false, { emitEvent: false });
                ctrl.disable({ emitEvent: false });
            } else {
                ctrl.enable({ emitEvent: false });
            }
        };
        fg.get('start_date')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(updateActiveState);
        fg.get('start_time')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(updateActiveState);

        return fg;
    }

    /**
     * Extracts "dd.mm.yyyy" from a naive or offset-bearing ISO-8601 string.
     * Uses string splitting — no Date constructor — so the result is always
     * the wall-clock date written in the string, unaffected by browser timezone.
     * Handles both naive ("2026-05-01T09:00:00") and offset ("…+03:00") input.
     */
    private parseIsoToDate(iso: string): string {
        if (!iso) return '';
        const datePart = iso.split('T')[0]; // "2026-05-01"
        const segs = datePart.split('-');
        if (segs.length !== 3) return '';
        const [y, m, d] = segs;
        if (!y || !m || !d) return '';
        return `${d}.${m}.${y}`;
    }

    /**
     * Extracts "HH:MM AM/PM" from a naive or offset-bearing ISO-8601 string.
     * Uses string splitting — no Date constructor — so the result is always
     * the wall-clock time written in the string, unaffected by browser timezone.
     * Handles both naive ("2026-05-01T09:00:00") and offset ("…+03:00") input.
     */
    private parseIsoToTime(iso: string): string {
        if (!iso) return '';
        const timePart = iso.split('T')[1]; // "09:00:00" or "09:00:00+03:00"
        if (!timePart) return '';
        const [hStr, minStr] = timePart.slice(0, 5).split(':'); // take only "HH:MM"
        if (!hStr || !minStr) return '';
        let h = parseInt(hStr, 10);
        const min = parseInt(minStr, 10);
        if (isNaN(h) || isNaN(min)) return '';
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

        if (!this.startDateTimeDirty()) return '';

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

        const startDateStr = this.form.get('start_date')?.value ?? '';
        const startTimeStr = this.form.get('start_time')?.value ?? '';
        if (startDateStr && /^\d{2}\.\d{2}\.\d{4}$/.test(startDateStr)) {
            const sy = parseInt(startDateStr.slice(6), 10);
            const sm = parseInt(startDateStr.slice(3, 5), 10) - 1;
            const sd = parseInt(startDateStr.slice(0, 2), 10);
            const parsedStart = new Date(sy, sm, sd);

            const ampmToMinutes = (t: string): number => {
                const tm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
                if (!tm) return 0;
                let h = parseInt(tm[1], 10);
                const min = parseInt(tm[2], 10);
                if (tm[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                else if (tm[3].toUpperCase() === 'AM' && h === 12) h = 0;
                return h * 60 + min;
            };

            const endTs = parsed.getTime() + ampmToMinutes(time) * 60_000;
            const startTs = parsedStart.getTime() + ampmToMinutes(startTimeStr) * 60_000;

            if (endTs <= startTs) {
                return 'End date and time must be after start date and time';
            }
        }

        if (!this.endDateTimeDirty()) return '';

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
            isActive: f.is_active ?? false,
            runMode,
            startDateTime: this.buildDateTimeString(f.start_date ?? '', f.start_time ?? ''),
            intervalEvery,
            intervalUnit,
            weekdays,
            endType,
            endDateTime,
            maxRuns,
            currentRuns: this.node().data.currentRuns ?? 0,
            timezone: (f.timezone as string | null) ?? '',
        };

        return {
            ...this.node(),
            node_name: f.node_name ?? this.node().node_name,
            data,
        };
    }

    private normalizeTimezone(iana: string): string {
        // Europe/Kiev is the pre-2022 IANA alias — normalize to the canonical name.
        return iana === 'Europe/Kiev' ? 'Europe/Kyiv' : iana;
    }

    private resolveTimezone(raw: string | null | undefined): string | null {
        if (!raw) return null;
        const normalized = this.normalizeTimezone(raw);
        if (normalized === 'UTC' || normalized === 'Etc/UTC') return null;
        try {
            new Intl.DateTimeFormat('en', { timeZone: normalized });
            return normalized;
        } catch {
            return null;
        }
    }

    private normalizeEndType(raw: string | null | undefined): ScheduleEndType {
        if (raw === 'on_date') return 'on_date';
        if (raw === 'after_n_runs' || raw === 'after_runs') return 'after_n_runs';
        return 'never';
    }

    /**
     * Combines "dd.mm.yyyy" date and "HH:MM AM/PM" time into a naive ISO-8601
     * datetime string: "YYYY-MM-DDTHH:MM:00" — no UTC offset, no Z suffix.
     * Timezone is sent separately as the IANA string in schedule.timezone.
     * No Date constructor is used, so the result is always the exact wall-clock
     * time the user entered, unaffected by browser timezone.
     */
    private buildDateTimeString(date: string, time: string): string {
        if (!date || !time) return '';

        const dateMatch = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!dateMatch || !timeMatch) return '';

        const d = parseInt(dateMatch[1], 10);
        const m = parseInt(dateMatch[2], 10);
        const y = parseInt(dateMatch[3], 10);
        let h = parseInt(timeMatch[1], 10);
        const min = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3].toUpperCase();

        if (ampm === 'PM' && h !== 12) h += 12;
        else if (ampm === 'AM' && h === 12) h = 0;

        if (d < 1 || d > 31 || m < 1 || m > 12 || h > 23 || min > 59) return '';

        const pad = (n: number) => String(n).padStart(2, '0');
        return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00`;
    }

    private defaultFutureDateTime(): Date {
        const d = new Date();
        d.setSeconds(0, 0);
        d.setMinutes(d.getMinutes() + 5);
        const rem = d.getMinutes() % 5;
        if (rem !== 0) {
            d.setMinutes(d.getMinutes() + (5 - rem));
        }
        return d;
    }

    private formatCurrentDate(d: Date): string {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return `${dd}.${mm}.${yyyy}`;
    }

    private formatCurrentTime(d: Date): string {
        let h = d.getHours();
        const min = d.getMinutes();
        const meridiem: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(min)} ${meridiem}`;
    }
}
