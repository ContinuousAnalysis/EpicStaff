import { CommonModule } from '@angular/common';
import { Component, inject, Input, OnInit, Output } from '@angular/core';
import { EventEmitter } from '@angular/core';
import { signal } from '@angular/core';
import {
    AbstractControl,
    ControlContainer,
    FormArray,
    FormBuilder,
    FormGroup,
    FormGroupDirective,
    ReactiveFormsModule,
} from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { AppSvgIconComponent } from '../../../shared/components/app-svg-icon/app-svg-icon.component';
import { ToggleSwitchComponent } from '../../../shared/components/form-controls/toggle-switch/toggle-switch.component';
import { HelpTooltipComponent } from '../../../shared/components/help-tooltip/help-tooltip.component';
import { PythonCodeRunService } from '../../services/python-code-run.service';
import { SidePanelService } from '../../services/side-panel.service';

@Component({
    selector: 'app-input-map',
    standalone: true,
    imports: [ReactiveFormsModule, CommonModule, HelpTooltipComponent, ToggleSwitchComponent, AppSvgIconComponent],
    viewProviders: [
        {
            provide: ControlContainer,
            useExisting: FormGroupDirective,
        },
    ],
    template: `
        <div class="input-map-container">
            <div class="input-map-header">
                <label>Input List</label>
                <app-help-tooltip
                    position="right"
                    text="Maps function arguments to domain variables using key-value pairs. For example, 'project_id' = 'current_project' maps the function parameter 'project_id' to the flow variable 'current_project'."
                ></app-help-tooltip>
                <div class="test-mode-header">
                    <span>Test mode</span>
                    <app-toggle-switch [checked]="testMode" (checkedChange)="onTestModeToggle($event)" />
                </div>
            </div>

            @if (!testMode) {
                <!-- Normal mode: input map list -->
                <div formArrayName="input_map" class="input-map-list">
                    @for (pair of pairs.controls; let i = $index; track pair) {
                        <div class="input-map-item" [formGroupName]="i">
                            <div class="input-map-fields">
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        formControlName="key"
                                        placeholder="Function Argument Name"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                        (keydown.enter)="onEnterKey($event, i)"
                                    />
                                </div>
                                <div class="equals-sign">=</div>
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        formControlName="value"
                                        placeholder="Domain Variable Name"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                        (keydown.enter)="onEnterKey($event, i)"
                                    />
                                </div>
                                <app-svg-icon
                                    icon="trash"
                                    size="1rem"
                                    class="delete-icon"
                                    (click)="removePair(i)"
                                ></app-svg-icon>
                            </div>
                        </div>
                    }
                </div>
                <button type="button" class="add-pair-btn" (click)="addPair()">
                    <app-svg-icon icon="plus" size="16px"></app-svg-icon> Add Input
                </button>
            } @else {
                <!-- Test mode: editable test variables backed by parent form 'test_input' FormArray -->
                <div formArrayName="test_input" class="input-map-list">
                    @for (pair of testPairs.controls; let i = $index; track pair) {
                        <div class="input-map-item" [formGroupName]="i">
                            <div class="input-map-fields">
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        formControlName="key"
                                        placeholder="Function Argument Name"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                    />
                                </div>
                                <div class="equals-sign">=</div>
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        formControlName="value"
                                        placeholder="Test value"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                    />
                                </div>
                                <app-svg-icon
                                    icon="trash"
                                    size="1rem"
                                    class="delete-icon"
                                    (click)="removeTestVariable(i)"
                                ></app-svg-icon>
                            </div>
                        </div>
                    }
                </div>
                <button type="button" class="add-pair-btn" (click)="addTestVariable()">
                    <i class="ti ti-plus"></i> Add Input
                </button>
                <div class="test-mode-actions">
                    <button type="button" class="btn-secondary" (click)="onClearAll()">Clear All</button>
                    <button
                        type="button"
                        class="btn-secondary"
                        [disabled]="fillLoading() || !pythonNodeId"
                        (click)="onFillVariables()"
                    >
                        {{ fillLoading() ? 'Loading...' : 'Fill Variables' }}
                    </button>
                    <button type="button" class="btn-primary" [disabled]="!canRunTest()" (click)="onRunTest()">
                        Run Test
                    </button>
                </div>
            }
        </div>
    `,
    styles: [
        `
            .input-map-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 100%;
            }

            .input-map-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .input-map-header label {
                font-size: 0.875rem;
                font-weight: 400;
                color: var(--color-text-primary);
                margin: 0;
            }

            .test-mode-header {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-left: auto;
            }

            .test-mode-header span {
                font-size: 0.875rem;
                color: var(--color-text-secondary, #999);
            }

            .function-arg {
                flex: 1;
            }

            .domain-var {
                flex: 1;
            }

            .equals {
                width: 20px;
                text-align: center;
            }

            .input-map-list {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                width: 100%;
                min-width: 0;
            }

            .input-map-item {
                width: 100%;
            }

            .input-map-fields {
                display: flex;
                gap: 0.5rem;
                align-items: center;
                width: 100%;
            }

            .input-wrapper {
                flex: 1;
                min-width: 0;
            }
            .equals-sign {
                color: #fff;
                font-weight: 500;
                margin: 0 -2px;
            }

            .input-wrapper input {
                width: 100%;
                padding: 0.5rem 0.75rem;
                background-color: var(--color-input-background);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #fff;
                font-size: 0.875rem;
                outline: none;
                transition: border-color 0.2s ease;

                &:focus {
                    border-color: var(--active-color);
                }

                &::placeholder {
                    color: rgba(255, 255, 255, 0.3);
                }
            }

            .delete-icon {
                font-size: 1rem;
                cursor: pointer;
                color: #ccc;
                padding: 0.2rem;
                border-radius: 4px;
                transition: all 0.2s ease;
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;

                &:hover {
                    color: red;
                    background-color: rgba(255, 0, 0, 0.1);
                }
            }

            .add-pair-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: var(--color-action-btn-background);
                border: 1px solid var(--color-divider-subtle);
                border-radius: 4px;
                color: var(--color-text-primary);
                transition: background-color 0.2s;
                cursor: pointer;
                font-size: 0.875rem;

                &:hover {
                    background: var(--color-action-btn-background-hover);
                }

                app-svg-icon {
                    flex-shrink: 0;
                }

                i {
                    font-size: 16px;
                }
            }

            .test-mode-actions {
                display: flex;
                gap: 0.5rem;
                width: 100%;
                margin-top: 0.75rem;
            }

            .btn-secondary,
            .btn-primary {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid var(--color-divider-subtle);
                border-radius: 4px;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: center;
            }

            .btn-secondary {
                background: var(--color-action-btn-background);
                color: var(--color-text-primary);

                &:hover:not(:disabled) {
                    background: var(--color-action-btn-background-hover);
                }

                &:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            }

            .btn-primary {
                background: #685fff;
                color: white;
                border-color: #685fff;

                &:hover:not(:disabled) {
                    background: #5a4ade;
                    border-color: #5a4ade;
                }

                &:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            }
        `,
    ],
})
export class InputMapComponent implements OnInit {
    @Input() activeColor: string = '#685fff';
    @Input() testMode: boolean = false;
    @Input() pythonNodeId: number | null = null;
    @Output() testModeChange = new EventEmitter<boolean>();
    @Output() runTest = new EventEmitter<Record<string, string>>();

    fillLoading = signal(false);
    private normalModeSnapshot: { key: string; value: string }[] = [];

    private readonly pythonCodeRunService = inject(PythonCodeRunService);

    constructor(
        private controlContainer: ControlContainer,
        private fb: FormBuilder,
        private sidePanelService: SidePanelService
    ) {}

    ngOnInit() {
        if (this.pairs.length === 0) {
            this.addPair();

            setTimeout(() => {
                this.pairs.at(0).markAsPristine();
                this.pairs.at(0).markAsUntouched();
                this.pairs.updateValueAndValidity();
            });
        }
    }

    get parentForm(): FormGroup {
        return this.controlContainer.control as FormGroup;
    }

    get pairs(): FormArray {
        return this.parentForm.get('input_map') as FormArray;
    }

    get testPairs(): FormArray {
        return this.parentForm.get('test_input') as FormArray;
    }

    addPair() {
        this.pairs.push(
            this.fb.group({
                key: [''],
                value: ['variables.'],
            })
        );
    }

    removePair(index: number) {
        this.pairs.removeAt(index);
        if (this.pairs.length === 0) {
            this.addPair();
        }
    }

    onEnterKey(event: Event, currentIndex: number) {
        const keyboardEvent = event as KeyboardEvent;
        keyboardEvent.preventDefault();

        this.addPair();

        setTimeout(() => {
            const newIndex = currentIndex + 1;
            const newPairElement = document.querySelector(
                `[formGroupName="${newIndex}"] input[formControlName="key"]`
            ) as HTMLInputElement;
            if (newPairElement) {
                newPairElement.focus();
            }
        }, 0);
    }

    onTestModeToggle(value: boolean): void {
        if (value) {
            this.normalModeSnapshot = this.pairs.controls.map((c) => ({
                key: c.value.key as string,
                value: c.value.value as string,
            }));

            this.testPairs.clear({ emitEvent: false });
            this.normalModeSnapshot
                .filter((item) => item.key?.trim() !== '')
                .forEach((item) => {
                    this.testPairs.push(
                        this.fb.group({
                            key: [item.key],
                            value: [''],
                        }),
                        { emitEvent: false }
                    );
                });
            this.testPairs.markAsPristine();
        } else {
            const changed = this.syncTestKeysToNormalMode();
            this.testPairs.clear({ emitEvent: false });
            this.normalModeSnapshot = [];
            if (changed) {
                this.sidePanelService.triggerAutosave();
            }
        }
        this.testMode = value;
        this.testModeChange.emit(value);
    }

    canRunTest(): boolean {
        const validTestVars = this.testPairs.controls.filter((c) => (c.value.key as string)?.trim() !== '');
        if (validTestVars.length === 0) {
            return true;
        }
        return validTestVars.every((c) => (c.value.value as string)?.trim() !== '');
    }

    onRunTest(): void {
        const inputs = Object.fromEntries(
            this.testPairs.controls.map((c) => [c.value.key as string, c.value.value as string])
        );
        this.runTest.emit(inputs);
    }

    onFillVariables(): void {
        if (!this.pythonNodeId) return;
        this.fillLoading.set(true);
        this.pythonCodeRunService
            .getLastTestInput(this.pythonNodeId)
            .pipe(finalize(() => this.fillLoading.set(false)))
            .subscribe({
                next: ({ input }) => {
                    for (const [key, value] of Object.entries(input)) {
                        const existing = this.testPairs.controls.find((c) => c.value.key === key);
                        if (existing) {
                            if (!existing.value.value) {
                                existing.get('value')?.setValue(String(value));
                            }
                        } else {
                            this.testPairs.push(
                                this.fb.group({
                                    key: [key],
                                    value: [String(value)],
                                })
                            );
                        }
                    }
                    this.testPairs.markAsDirty();
                },
            });
    }

    onClearAll(): void {
        this.testPairs.controls.forEach((c) => c.get('value')?.setValue(''));
        this.testPairs.markAsDirty();
    }

    addTestVariable(): void {
        this.testPairs.push(
            this.fb.group({
                key: [''],
                value: [''],
            })
        );
    }

    removeTestVariable(index: number): void {
        this.testPairs.removeAt(index);
        this.testPairs.markAsDirty();
    }

    private syncTestKeysToNormalMode(): boolean {
        const snapshot = this.normalModeSnapshot;
        const testValues = this.testPairs.controls.map((c) => ({
            key: (c.value.key as string) ?? '',
            value: (c.value.value as string) ?? '',
        }));

        if (snapshot.length === 0 && testValues.length === 0) {
            return false;
        }

        const snapshotKeys = new Set(snapshot.map((item) => item.key?.trim() ?? '').filter((k) => k !== ''));
        const currentTestKeys = new Set(testValues.map((item) => item.key?.trim() ?? '').filter((k) => k !== ''));

        const removedKeys = new Set<string>();
        snapshotKeys.forEach((k) => {
            if (!currentTestKeys.has(k)) removedKeys.add(k);
        });
        const addedKeys = new Set<string>();
        currentTestKeys.forEach((k) => {
            if (!snapshotKeys.has(k)) addedKeys.add(k);
        });

        let changed = false;

        for (let i = this.pairs.length - 1; i >= 0; i--) {
            const key = ((this.pairs.at(i).value.key as string | undefined) ?? '').trim();
            if (key !== '' && removedKeys.has(key)) {
                this.pairs.removeAt(i);
                changed = true;
            }
        }

        for (const newKey of addedKeys) {
            this.pairs.push(
                this.fb.group({
                    key: [newKey],
                    value: ['variables.'],
                })
            );
            changed = true;
        }

        if (this.pairs.length === 0) {
            this.addPair();
        }

        if (changed) {
            this.pairs.markAsDirty();
        }

        return changed;
    }

    private getValidInputPairs(): AbstractControl[] {
        return this.pairs.controls.filter((control) => {
            const value = control.value;
            return value.key?.trim() !== '';
        });
    }
}
