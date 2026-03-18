import { ChangeDetectionStrategy, Component, computed, forwardRef, input, model, output, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SwitchOption<T = unknown> {
    label: string;
    value: T;
}

@Component({
    selector: 'app-segmented-switch',
    standalone: true,
    templateUrl: './segmented-switch.component.html',
    styleUrls: ['./segmented-switch.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => SegmentedSwitchComponent),
            multi: true,
        },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedSwitchComponent<T> implements ControlValueAccessor {
    options = input.required<SwitchOption<T>[]>();
    disabled = input(false);

    value = model<T | null>(null);
    valueChange = output<T>();

    isDisabled = signal(false);

    activeIndex = computed(() => {
        const idx = this.options().findIndex((o) => o.value === this.value());
        return idx === -1 ? 0 : idx;
    });

    sliderTransform = computed(() => `translateX(${this.activeIndex() * 100}%)`);

    private onChange: (value: T) => void = () => {};
    private onTouched: () => void = () => {};

    select(option: SwitchOption<T>): void {
        if (this.isDisabled()) return;
        this.value.set(option.value);
        this.onChange(option.value);
        this.onTouched();
        this.valueChange.emit(option.value);
    }

    writeValue(value: T | null): void {
        this.value.set(value);
    }

    registerOnChange(fn: (value: T) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.isDisabled.set(isDisabled);
    }
}
