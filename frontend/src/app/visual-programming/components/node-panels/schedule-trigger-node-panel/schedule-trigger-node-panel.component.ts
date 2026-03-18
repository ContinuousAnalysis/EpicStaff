import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
    CheckboxComponent,
    CustomInputComponent,
    DatePickerComponent,
    NumberStepperComponent,
    RadioButtonComponent,
    SegmentedOption,
    SelectComponent,
    SelectItem,
    TimePickerComponent,
} from '@shared/components';

import { ScheduleTriggerNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';

@Component({
    standalone: true,
    selector: 'app-schedule-trigger-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        DatePickerComponent,
        TimePickerComponent,
        RadioButtonComponent,
        SelectComponent,
        NumberStepperComponent,
        CheckboxComponent,
    ],
    templateUrl: 'schedule-trigger-node-panel.component.html',
    styleUrls: ['schedule-trigger-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleTriggerNodePanelComponent extends BaseSidePanel<ScheduleTriggerNodeModel> {
    public readonly isExpanded = input<boolean>(false);

    private destroyRef = inject(DestroyRef);

    runMode = signal<string>('once');
    endMode = signal<string>('never');
    startRowError = signal<string>('');

    showRepeatFields = computed(() => this.runMode() === 'repeat');
    showEndDateTime = computed(() => this.endMode() === 'on_date');
    showMaxRuns = computed(() => this.endMode() === 'after_runs');

    readonly runModeOptions: SegmentedOption<string>[] = [
        { label: 'Once', value: 'once' },
        { label: 'Repeat', value: 'repeat' },
    ];

    readonly endModeOptions: SegmentedOption<string>[] = [
        { label: 'Never', value: 'never' },
        { label: 'On date', value: 'on_date' },
        { label: 'After N runs', value: 'after_runs' },
    ];

    readonly repeatUnitItems: SelectItem[] = [
        { name: 'Minutes', value: 'minutes' },
        { name: 'Hours', value: 'hours' },
        { name: 'Days', value: 'days' },
        { name: 'Weeks', value: 'weeks' },
        { name: 'Months', value: 'months' },
    ];

    get activeColor(): string {
        return this.node().color || '#FF5C00';
    }

    initializeForm(): FormGroup {
        const fg = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            start_date: [''],
            start_time: [''],
            run_mode: ['once'],
            repeat_every: [1],
            repeat_unit: ['hours'],
            end_mode: ['never'],
            end_date: [''],
            end_time: [''],
            max_runs: [null],
            is_active: [true],
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

        return fg;
    }

    private computeStartError(dateVal: string | null, timeVal: string | null): string {
        const date = dateVal ?? '';
        const time = timeVal ?? '';

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

    createUpdatedNode(): ScheduleTriggerNodeModel {
        return {
            ...this.node(),
            node_name: this.form.value.node_name,
        };
    }
}
