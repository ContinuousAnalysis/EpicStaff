import { ChangeDetectionStrategy, Component, computed, forwardRef, input, model, output, signal } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { TooltipComponent } from "../tooltip/tooltip.component";

export interface SegmentedOption<T = unknown> {
    label: string;
    value: T;
}

@Component({
    selector: 'app-radio-button',
    templateUrl: './radio-button.component.html',
    styleUrls: ['./radio-button.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => RadioButtonComponent),
            multi: true,
        },
    ],
    imports: [TooltipComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RadioButtonComponent<T> implements ControlValueAccessor {
    icon = input<string>('help_outline');
    label = input<string>('');
    required = input<boolean>(false);
    tooltipText = input<string>('');

    mod = input<'default' | 'small' | 'segmented'>('default');
    options = input.required<SegmentedOption<T>[]>();
    disabled = input(false);

    value = model<T | null>(null);
    valueChange = output<T>();

    private _disabled = signal(false);
    isDisabled = computed(() => this.disabled() || this._disabled());

    activeIndex = computed(() => {
        const idx = this.options().findIndex((o) => o.value === this.value());
        return idx === -1 ? 0 : idx;
    });

    sliderTransform = computed(() => `translateX(${this.activeIndex() * 100}%)`);

    private onChange: (value: T) => void = () => {};
    private onTouched: () => void = () => {};

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
        this._disabled.set(isDisabled);
    }

    select(option: SegmentedOption<T>) {
        if (this.isDisabled()) return;

        this.value.set(option.value);
        this.onChange(option.value);
        this.onTouched();
        this.valueChange.emit(option.value);
    }
}
