import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    model,
    signal,
    computed,
    forwardRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormFieldLabelComponent } from '../form-field-label/form-field-label.component';

export type StepperSize = 'sm' | 'md' | 'lg';

@Component({
    selector: 'app-number-stepper',
    standalone: true,
    imports: [CommonModule, FormsModule, FormFieldLabelComponent],
    templateUrl: './number-stepper.component.html',
    styleUrls: ['./number-stepper.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => NumberStepperComponent),
            multi: true,
        },
    ],
})
export class NumberStepperComponent implements ControlValueAccessor {
    label = input<string>('');
    tooltipText = input<string>('');
    placeholder = input<string>('0');
    min = input<number | null>(null);
    max = input<number | null>(null);
    step = input<number>(1);
    size = input<StepperSize>('md');

    value = model<number | null>(null);
    changed = output<number | null>();

    onChange: (value: number | null) => void = () => {};
    onTouched: () => void = () => {};
    isDisabled = signal(false);
    hovered = signal(false);

    displayValue = computed(() => {
        const val = this.value();
        if (val === null || val === undefined) return '';
        return val.toString();
    });

    canStepDown = computed(() => {
        const val = this.value();
        const minVal = this.min();
        if (val === null) return true;
        if (minVal === null) return true;
        return val > minVal;
    });

    canStepUp = computed(() => {
        const val = this.value();
        const maxVal = this.max();
        if (val === null) return true;
        if (maxVal === null) return true;
        return val < maxVal;
    });

    onInputChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const newValue = target.value === '' ? null : parseFloat(target.value);
        this.updateValue(newValue);
    }

    onStepDown() {
        const current = this.value() ?? (this.min() ?? 0);
        const minVal = this.min();
        let newValue = current - this.step();
        if (minVal !== null && newValue < minVal) {
            newValue = minVal;
        }
        this.updateValue(newValue);
    }

    onStepUp() {
        const current = this.value() ?? (this.min() ?? 0);
        const maxVal = this.max();
        let newValue = current + this.step();
        if (maxVal !== null && newValue > maxVal) {
            newValue = maxVal;
        }
        this.updateValue(newValue);
    }

    private updateValue(value: number | null) {
        this.value.set(value);
        this.changed.emit(value);
        this.onChange(value);
    }

    writeValue(value: number | null): void {
        this.value.set(value);
    }

    registerOnChange(fn: (value: number | null) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.isDisabled.set(isDisabled);
    }
}

