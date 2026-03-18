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

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

export const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface DayCell {
    day: number | null;
    date: Date | null;
    isToday: boolean;
    isSelected: boolean;
    isPast: boolean;
}

/** Parse dd.mm.yyyy string into a Date, or null if invalid. */
function parseDate(value: string): Date | null {
    const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10);
    const date = new Date(y, m, d);
    if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
    return date;
}

/** Format a Date as dd.mm.yyyy. */
function formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear());
    return `${d}.${m}.${y}`;
}

@Component({
    selector: 'app-date-picker',
    standalone: true,
    imports: [FormsModule, OverlayModule, TooltipComponent],
    templateUrl: './date-picker.component.html',
    styleUrls: ['./date-picker.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DatePickerComponent),
            multi: true,
        },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatePickerComponent implements ControlValueAccessor {
    label = input<string>('');
    placeholder = input<string>('dd.mm.yyyy');
    tooltipText = input<string>('');
    activeColor = input<string>('');
    errorMessage = input<string>('');
    required = input<boolean>(false);

    selectedDate = signal<Date | null>(null);
    viewDate = signal<Date>(new Date());
    inputValue = signal<string>('');
    inputError = signal<string>('');
    dropdownWidth = signal<number>(0);
    isOpen = signal<boolean>(false);
    isDisabled = signal<boolean>(false);

    readonly weekdays = WEEKDAY_LABELS;

    viewMonthYear = computed<string>(() => {
        const d = this.viewDate();
        return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    });

    resolvedActiveColor = computed<string>(() => this.activeColor() || '#685fff');

    dayCells = computed<DayCell[]>(() => {
        const view = this.viewDate();
        const selected = this.selectedDate();
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        const year = view.getFullYear();
        const month = view.getMonth();

        // Monday-start: Sun=0 → 6, Mon=1 → 0, …, Sat=6 → 5
        const firstDow = new Date(year, month, 1).getDay();
        const leadingEmpties = firstDow === 0 ? 6 : firstDow - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells: DayCell[] = [];

        for (let i = 0; i < leadingEmpties; i++) {
            cells.push({ day: null, date: null, isToday: false, isSelected: false, isPast: false });
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const isToday = date.getTime() === todayMidnight.getTime();
            const isPast = date.getTime() < todayMidnight.getTime();
            const isSelected = selected
                ? selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === d
                : false;
            cells.push({ day: d, date, isToday, isSelected, isPast });
        }

        return cells;
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

    onInput(): void {
        const val = this.inputValue();

        if (!val) {
            this.selectedDate.set(null);
            this.inputError.set('');
            this.onChange(val);
            return;
        }

        // Only validate once the field looks like a complete date
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
            this.inputError.set('');
            this.onChange(val);
            return;
        }

        const parsed = parseDate(val);
        if (!parsed) {
            this.inputError.set('Invalid date');
            this.selectedDate.set(null);
            this.onChange(val);
            return;
        }

        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        if (parsed.getTime() < todayMidnight.getTime()) {
            this.inputError.set('Date must be today or later');
            this.selectedDate.set(null);
            this.onChange(val);
            return;
        }

        this.inputError.set('');
        this.selectedDate.set(parsed);
        this.viewDate.set(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
        this.onChange(val);
    }

    selectDay(cell: DayCell): void {
        if (!cell.date || cell.isPast) return;
        this.selectedDate.set(cell.date);
        this.inputError.set('');
        const formatted = formatDate(cell.date);
        this.inputValue.set(formatted);
        this.onChange(formatted);
        this.onTouched();
        this.close();
    }

    prevMonth(): void {
        const d = this.viewDate();
        this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }

    nextMonth(): void {
        const d = this.viewDate();
        this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
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
            .withPush(false);

        this.dropdownWidth.set(this.triggerEl.nativeElement.offsetWidth);

        this.overlayRef = this.overlay.create({
            positionStrategy,
            scrollStrategy: this.overlay.scrollStrategies.reposition(),
            hasBackdrop: true,
            backdropClass: 'transparent-backdrop',
        });

        this.overlayRef.backdropClick().subscribe(() => this.close());
        const portal = new TemplatePortal(this.dropdownTemplate, this.vcr);
        this.overlayRef.attach(portal);
        this.isOpen.set(true);
    }

    toggleDropdown(): void {
        if (this.isOpen()) {
            this.close();
        } else {
            this.openDropdown();
        }
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
        this.inputError.set('');
        if (value) {
            const parsed = parseDate(value);
            if (parsed) {
                this.selectedDate.set(parsed);
                this.viewDate.set(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
            }
            this.inputValue.set(value);
        } else {
            this.selectedDate.set(null);
            this.inputValue.set('');
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
