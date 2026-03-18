import { Overlay, OverlayModule, OverlayPositionBuilder, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    forwardRef,
    inject,
    input,
    signal,
    ViewChild,
    ViewContainerRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

import { TooltipComponent } from '../tooltip/tooltip.component';

/** 12-hour time slots: 12:00 → 12:05 → … → 11:55 */
function generateHourSlots(): string[] {
    const slots: string[] = [];
    for (let h = 0; h < 12; h++) {
        for (let m = 0; m < 60; m += 5) {
            const display = h === 0 ? 12 : h;
            slots.push(`${String(display).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }
    return slots;
}

const HOUR_SLOTS = generateHourSlots();

/** Parse a stored value ("07:00 PM" or legacy "19:00") into parts. */
function parseValue(value: string): { time: string; meridiem: 'AM' | 'PM' } | null {
    if (!value) return null;
    const ampm = value.match(/^(\d{1,2}:\d{2})\s*(AM|PM)$/i);
    if (ampm) {
        return { time: ampm[1].padStart(5, '0'), meridiem: ampm[2].toUpperCase() as 'AM' | 'PM' };
    }
    // Legacy 24-hour format "HH:mm"
    const h24 = value.match(/^(\d{2}):(\d{2})$/);
    if (h24) {
        let h = parseInt(h24[1], 10);
        const m = h24[2];
        const meridiem: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return { time: `${String(h).padStart(2, '0')}:${m}`, meridiem };
    }
    return null;
}

@Component({
    selector: 'app-time-picker',
    standalone: true,
    imports: [FormsModule, OverlayModule, TooltipComponent],
    templateUrl: './time-picker.component.html',
    styleUrls: ['./time-picker.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => TimePickerComponent),
            multi: true,
        },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimePickerComponent implements ControlValueAccessor {
    label = input<string>('');
    placeholder = input<string>('hh:mm');
    tooltipText = input<string>('');
    activeColor = input<string>('');
    errorMessage = input<string>('');
    required = input<boolean>(false);

    /** The hh:mm portion typed or selected (no meridiem). */
    timeInput = signal<string>('');
    meridiem = signal<'AM' | 'PM'>('AM');
    isOpen = signal<boolean>(false);
    isDisabled = signal<boolean>(false);

    /** Full formatted value shown in the trigger and emitted to the form. */
    displayValue = computed<string>(() => {
        const t = this.timeInput();
        return t ? `${t} ${this.meridiem()}` : '';
    });

    filteredSlots = computed<string[]>(() => {
        const val = this.timeInput().trim();
        if (!val || HOUR_SLOTS.includes(val)) return HOUR_SLOTS;
        const filtered = HOUR_SLOTS.filter((s) => s.startsWith(val));
        return filtered.length > 0 ? filtered : HOUR_SLOTS;
    });

    @ViewChild('triggerEl') triggerEl!: ElementRef<HTMLDivElement>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @ViewChild('dropdownTemplate') dropdownTemplate!: any;

    private overlayRef: OverlayRef | null = null;
    private overlay = inject(Overlay);
    private overlayPositionBuilder = inject(OverlayPositionBuilder);
    private vcr = inject(ViewContainerRef);

    private onChange: (v: string) => void = () => {};
    private onTouched: () => void = () => {};

    onFocus(): void {
        this.openDropdown();
    }

    onInput(): void {
        this.onChange(this.displayValue());
        if (!this.isOpen()) {
            this.openDropdown();
        }
    }

    selectSlot(slot: string): void {
        this.timeInput.set(slot);
        this.onChange(this.displayValue());
        this.onTouched();
        this.close();
    }

    setMeridiem(m: 'AM' | 'PM'): void {
        this.meridiem.set(m);
        this.onChange(this.displayValue());
    }

    openDropdown(): void {
        if (this.isOpen() || this.isDisabled()) return;

        const positionStrategy = this.overlayPositionBuilder
            .flexibleConnectedTo(this.triggerEl)
            .withPositions([
                {
                    originX: 'start',
                    originY: 'bottom',
                    overlayX: 'start',
                    overlayY: 'top',
                    offsetY: 4,
                },
            ])
            .withPush(true);

        this.overlayRef = this.overlay.create({
            positionStrategy,
            scrollStrategy: this.overlay.scrollStrategies.reposition(),
            hasBackdrop: true,
            backdropClass: 'transparent-backdrop',
            width: this.triggerEl.nativeElement.offsetWidth,
        });

        this.overlayRef.backdropClick().subscribe(() => this.close());

        const portal = new TemplatePortal(this.dropdownTemplate, this.vcr);
        this.overlayRef.attach(portal);
        this.isOpen.set(true);
    }

    close(): void {
        if (this.overlayRef) {
            this.overlayRef.dispose();
            this.overlayRef = null;
        }
        this.onTouched();
        this.isOpen.set(false);
    }

    // ControlValueAccessor
    writeValue(value: string): void {
        const parsed = parseValue(value);
        if (parsed) {
            this.timeInput.set(parsed.time);
            this.meridiem.set(parsed.meridiem);
        } else {
            this.timeInput.set('');
        }
    }

    registerOnChange(fn: (v: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.isDisabled.set(isDisabled);
    }
}
