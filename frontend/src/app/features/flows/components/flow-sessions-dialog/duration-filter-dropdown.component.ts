import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    Output,
    SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppSvgIconComponent } from '../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { ClickOutsideDirective } from '../../../../shared/directives/click-outside.directive';
import { DurationFilter, DurationOperator } from '../../services/flows-sessions.service';

@Component({
    selector: 'app-duration-filter-dropdown',
    standalone: true,
    imports: [CommonModule, FormsModule, ClickOutsideDirective, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './duration-filter-dropdown.component.html',
    styleUrls: ['./duration-filter-dropdown.component.scss'],
})
export class DurationFilterDropdownComponent implements OnChanges {
    @Input() value: DurationFilter | null = null;
    @Output() valueChange = new EventEmitter<DurationFilter | null>();

    public selectedOperator: DurationOperator = 'lessThan';
    public open = false;
    public val1: number | null = null;
    public val2: number | null = null;

    public readonly operators: { value: DurationOperator; label: string }[] = [
        { value: 'lessThan', label: '< Less' },
        { value: 'between', label: '<< Between' },
        { value: 'greaterThan', label: '> More' },
        { value: 'equal', label: '= Equal' },
    ];

    get label(): string {
        if (!this.value) return 'Duration';

        const { operator, value, value2 } = this.value;
        if (operator === 'between' && value2 != null) {
            return `${this.formatDuration(value)} – ${this.formatDuration(value2)}`;
        }
        const symbols: Record<DurationOperator, string> = {
            lessThan: '<',
            greaterThan: '>',
            equal: '=',
            between: '<<',
        };
        return `${symbols[operator]} ${this.formatDuration(value)}`;
    }

    constructor(private cdr: ChangeDetectorRef) {}

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['value'] && this.value) {
            this.selectedOperator = this.value.operator;
            this.val1 = this.value.value;
            this.val2 = this.value.value2 ?? null;
        }
    }

    public toggle(event: Event): void {
        event?.stopPropagation();
        this.open = !this.open;
        this.cdr.markForCheck();
    }

    public close(): void {
        this.open = false;
        this.cdr.markForCheck();
    }

    public selectOperator(operator: DurationOperator): void {
        this.selectedOperator = operator;
        this.cdr.markForCheck();
    }

    public apply(): void {
        if (this.val1 === null) return;
        if (this.selectedOperator === 'between' && this.val2 === null) return;

        const filter: DurationFilter = {
            operator: this.selectedOperator,
            value: Math.floor(this.val1),
            ...(this.selectedOperator === 'between' && this.val2 !== null ? { value2: Math.floor(this.val2) } : {}),
        };
        this.valueChange.emit(filter);
        this.close();
    }

    public clear(): void {
        this.val1 = null;
        this.val2 = null;
        this.selectedOperator = 'lessThan';
        this.valueChange.emit(null);
        this.close();
    }

    private formatDuration(seconds: number): string {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes < 60) {
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
}
