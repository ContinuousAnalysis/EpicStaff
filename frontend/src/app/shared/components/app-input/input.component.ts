import {
    Component,
    ChangeDetectionStrategy,
    input, output, model, signal,
} from '@angular/core';
import {FormsModule} from "@angular/forms";
import {NgClass} from "@angular/common";

@Component({
    selector: 'app-input',
    templateUrl: './input.component.html',
    styleUrls: ['./input.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FormsModule,
        NgClass
    ]
})
export class InputComponent {
    type = input<'text' | 'number'>('text');
    mod = input<'default' | 'small'>('default');
    placeholder = input<string>('Type here');
    invalid = input<boolean>(false);
    value = model<string | number | null>(null);
    changed = output<string | number | null>();

    hovered = signal<boolean>(false);

    onInputChange(value: string | number) {
        if (this.type() === 'text') {
            this.changed.emit(value?.toString() ?? '');
            return;
        }

        if (this.type() === 'number') {
            // Return null if input is empty
            if (value === '' || value === null || value === undefined) {
                this.value.set(null);
                this.changed.emit(null);
                return;
            }

            const num = Number(value);

            if (Number.isNaN(num)) return;

            this.value.set(num);
            this.changed.emit(num);
        }
    }

    onStep(delta: number) {
        const current = Number(this.value()) || 0;
        this.value.set(current + delta);
        this.changed.emit(current + delta);
    }
}
