import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    input,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
    CheckboxComponent,
    CustomInputComponent,
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
            start_time: [''],
            run_mode: ['once'],
            repeat_every: [1],
            repeat_unit: ['hours'],
            end_mode: ['never'],
            end_time: [''],
            max_runs: [null],
            is_active: [true],
        });

        fg.get('run_mode')!.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(v => this.runMode.set(v ?? 'once'));

        fg.get('end_mode')!.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(v => this.endMode.set(v ?? 'never'));

        return fg;
    }

    createUpdatedNode(): ScheduleTriggerNodeModel {
        return {
            ...this.node(),
            node_name: this.form.value.node_name,
        };
    }
}
