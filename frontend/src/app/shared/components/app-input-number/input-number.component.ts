import {
    Component,
    ChangeDetectionStrategy,
    input,
    output,
    model,
    signal, computed,
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {NgClass} from "@angular/common";

@Component({
    selector: 'app-input-number',
    templateUrl: './input-number.component.html',
    styleUrls: ['./input-number.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
        NgClass
    ],
})
export class InputNumberComponent {
    mod = input<'default' | 'small'>('default');
    placeholder = input<string>('Type here');
    invalid = input<boolean>(false);
    min = input<number | null>(null);
    max = input<number | null>(null);
    stepSize = input<number>(1);
    value = model<number | null>(null);
    changed = output<number | null>();

    hovered = signal<boolean>(false);

    isOutOfRange = computed(() => {
        const value = this.value();
        const min = this.min();
        const max = this.max();

        if (value === null) return false;
        if (min !== null && value < min) return true;
        if (max !== null && value > max) return true;

        return false;
    });

    isInvalid = computed(() => {
        return this.invalid() || this.isOutOfRange();
    });

    onInputChange(value: number) {
        if (value === null || value === undefined) {
            this.value.set(null);
            this.changed.emit(null);
            return;
        }

        let num = Number(value);
        if (Number.isNaN(num)) return;

        this.value.set(num);
        this.changed.emit(num);

    }

    onStep(direction: 1 | -1 = 1) {
        const current = Number(this.value()) || 0;
        let next = current + this.stepSize() * direction;

        this.value.set(next);
        this.changed.emit(next);
    }

    canStepUp(): boolean {
        const value = this.value();
        const max = this.max();

        if (value === null) {
            return max === null || this.stepSize() <= max;
        }

        return max === null || value < max;
    }

    canStepDown(): boolean {
        const value = this.value();
        const min = this.min();

        if (value === null) {
            return min === null || -this.stepSize() >= min;
        }

        return min === null || value > min;
    }

    onKeyDown(event: KeyboardEvent) {
        const allowedKeys = [
            'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'
        ];
        if (allowedKeys.includes(event.key)) return;

        if (!/^\d$/.test(event.key)) {
            event.preventDefault();
        }
    }
}
