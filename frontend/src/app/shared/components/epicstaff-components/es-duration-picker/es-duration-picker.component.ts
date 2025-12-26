import { Component, Input, forwardRef, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'es-duration-picker',
    standalone: true,
    imports: [CommonModule, FormsModule, MatTooltipModule, MatIconModule],
    template: `
        <div class="form-group">
            <div class="label-row">
                <div class="label-container" *ngIf="label">
                    <label>{{ label }}</label>
                    <mat-icon
                        *ngIf="tooltipText"
                        [matTooltip]="tooltipText"
                        matTooltipPosition="right"
                        matTooltipClass="custom-tooltip"
                        class="help-icon"
                    >
                        help
                    </mat-icon>
                </div>
                <button
                    type="button"
                    class="clear-btn"
                    (click)="clearDuration()"
                    [disabled]="disabled || isEmpty"
                >
                    Clear timer
                </button>
            </div>

            <div class="duration-inputs" [style.--active-color]="activeColor">
                <div class="duration-field">
                    <input
                        type="number"
                        [(ngModel)]="days"
                        (ngModelChange)="onTimeChange()"
                        (blur)="onTouched()"
                        class="duration-input days-input"
                        [class.error]="errorMessage"
                        [disabled]="disabled"
                        placeholder="0"
                        min="0"
                    />
                    <span class="duration-label">days</span>
                </div>

                <div class="duration-field">
                    <select
                        [(ngModel)]="hours"
                        (ngModelChange)="onTimeChange()"
                        (blur)="onTouched()"
                        class="duration-select"
                        [class.error]="errorMessage"
                        [disabled]="disabled"
                    >
                        <option [ngValue]="null">--</option>
                        <option *ngFor="let h of hourOptions" [ngValue]="h">{{ h | number:'2.0-0' }}</option>
                    </select>
                    <span class="duration-label">hrs</span>
                </div>

                <div class="duration-field">
                    <select
                        [(ngModel)]="minutes"
                        (ngModelChange)="onTimeChange()"
                        (blur)="onTouched()"
                        class="duration-select"
                        [class.error]="errorMessage"
                        [disabled]="disabled"
                    >
                        <option [ngValue]="null">--</option>
                        <option *ngFor="let m of minuteOptions" [ngValue]="m">{{ m | number:'2.0-0' }}</option>
                    </select>
                    <span class="duration-label">min</span>
                </div>
            </div>

            <div class="total-display" *ngIf="!isEmpty">
                Total: {{ totalMinutes }} minutes
            </div>

            <div class="error-message" *ngIf="errorMessage">
                {{ errorMessage }}
            </div>
        </div>
    `,
    styles: [
        `
            .form-group {
                .label-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .label-container {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                label {
                    display: block;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0;
                }

                .help-icon {
                    font-size: 18px;
                    width: 18px;
                    height: 18px;
                    color: rgba(255, 255, 255, 0.6);
                    cursor: help;
                    transition: color 0.2s ease;

                    &:hover {
                        color: rgba(255, 255, 255, 0.9);
                    }
                }

                .clear-btn {
                    background: transparent;
                    border: none;
                    color: rgba(255, 255, 255, 0.5);
                    padding: 4px 0;
                    cursor: pointer;
                    font-size: 12px;
                    transition: color 0.2s ease;

                    &:hover:not(:disabled) {
                        color: rgba(255, 255, 255, 0.9);
                        text-decoration: underline;
                    }

                    &:disabled {
                        opacity: 0.3;
                        cursor: not-allowed;
                    }
                }

                .duration-inputs {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .duration-field {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .duration-input,
                .duration-select {
                    padding: 8px 10px;
                    background-color: var(--color-input-background);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: white;
                    font-size: 14px;
                    transition: border-color 0.2s ease;

                    &:focus {
                        outline: none;
                        border-color: var(--active-color, #685fff);
                    }

                    &.error {
                        border-color: #ef4444;
                    }

                    &:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                }

                .duration-input {
                    width: 64px;
                    -moz-appearance: textfield;

                    &::-webkit-outer-spin-button,
                    &::-webkit-inner-spin-button {
                        -webkit-appearance: none;
                        margin: 0;
                    }
                }

                .days-input {
                    width: 56px;
                }

                .duration-select {
                    width: 64px;
                    cursor: pointer;

                    option {
                        background-color: #1a1a1a;
                    }
                }

                .duration-label {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    min-width: 28px;
                }

                .total-display {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    margin-top: 6px;
                }

                .error-message {
                    color: #ef4444;
                    font-size: 12px;
                    margin-top: 4px;
                    line-height: 1.4;
                }
            }

            :host ::ng-deep .custom-tooltip {
                background: #232323 !important;
                color: #fff !important;
                font-size: 0.9rem !important;
                max-width: 300px !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
            }
        `,
    ],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => EsDurationPickerComponent),
            multi: true,
        },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EsDurationPickerComponent implements ControlValueAccessor {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() label = '';
    @Input() tooltipText = '';
    @Input() activeColor = '#685fff';
    @Input() errorMessage = '';

    days: number | null = null;
    hours: number | null = null;
    minutes: number | null = null;
    disabled = false;

    private onChange: (value: number | null) => void = () => {};
    onTouched: () => void = () => {};

    readonly hourOptions: number[] = Array.from({ length: 24 }, (_, i) => i); // 0-23
    readonly minuteOptions: number[] = Array.from({ length: 60 }, (_, i) => i); // 0-59

    get isEmpty(): boolean {
        return this.days === null && this.hours === null && this.minutes === null;
    }

    get totalMinutes(): number {
        return (this.days ?? 0) * 1440 + (this.hours ?? 0) * 60 + (this.minutes ?? 0);
    }

    onTimeChange(): void {
        if (this.isEmpty) {
            this.onChange(null);
        } else {
            const total = this.totalMinutes;
            this.onChange(total > 0 ? total : null);
        }
    }

    clearDuration(): void {
        this.days = null;
        this.hours = null;
        this.minutes = null;
        this.onChange(null);
    }

    writeValue(totalMinutes: number | null): void {
        if (totalMinutes === null || totalMinutes === undefined || totalMinutes <= 0) {
            this.days = null;
            this.hours = null;
            this.minutes = null;
        } else {
            this.days = Math.floor(totalMinutes / 1440);
            const remainingAfterDays = totalMinutes % 1440;
            this.hours = Math.floor(remainingAfterDays / 60);
            this.minutes = remainingAfterDays % 60;
        }
        this.cdr.markForCheck();
    }

    registerOnChange(fn: (value: number | null) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled = isDisabled;
        this.cdr.markForCheck();
    }
}

