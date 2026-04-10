import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, Output, signal } from '@angular/core';
import { EventEmitter } from '@angular/core';
import {
    AbstractControl,
    ControlContainer,
    FormArray,
    FormBuilder,
    FormGroup,
    FormGroupDirective,
    ReactiveFormsModule,
} from '@angular/forms';

import { ToggleSwitchComponent } from '../../../shared/components/form-controls/toggle-switch/toggle-switch.component';
import { HelpTooltipComponent } from '../../../shared/components/help-tooltip/help-tooltip.component';
import { SidePanelService } from '../../services/side-panel.service';

interface TestVariable {
    key: string;
    value: string;
}

@Component({
    selector: 'app-input-map',
    standalone: true,
    imports: [ReactiveFormsModule, CommonModule, HelpTooltipComponent, ToggleSwitchComponent],
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
                                <i class="ti ti-trash delete-icon" (click)="removePair(i)"></i>
                            </div>
                        </div>
                    }
                </div>
                <button type="button" class="add-pair-btn" (click)="addPair()">
                    <i class="ti ti-plus"></i> Add Input
                </button>
            } @else {
                <!-- Test mode: editable test variables -->
                <div class="input-map-list">
                    @for (item of testValues(); let i = $index; track i) {
                        <div class="input-map-item">
                            <div class="input-map-fields">
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        [value]="item.key"
                                        (input)="onTestKeyChange(i, $any($event.target).value)"
                                        placeholder="Function Argument Name"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                    />
                                </div>
                                <div class="equals-sign">=</div>
                                <div class="input-wrapper">
                                    <input
                                        type="text"
                                        [value]="item.value"
                                        (input)="onTestValueChange(i, $any($event.target).value)"
                                        placeholder="Test value"
                                        [style.--active-color]="activeColor"
                                        autocomplete="off"
                                    />
                                </div>
                                <i class="ti ti-trash delete-icon" (click)="removeTestVariable(i)"></i>
                            </div>
                        </div>
                    }
                </div>
                <button type="button" class="add-pair-btn" (click)="addTestVariable()">
                    <i class="ti ti-plus"></i> Add Input
                </button>
                <div class="test-mode-actions">
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
    @Output() testModeChange = new EventEmitter<boolean>();
    @Output() runTest = new EventEmitter<Record<string, string>>();

    showTestInputs = signal(false);
    testValues = signal<TestVariable[]>([]);
    private normalModeSnapshot = signal<{ key: string; value: string }[]>([]);

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

        // Add a new pair after the current one
        this.addPair();

        // Focus on the key input of the newly added pair
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
            const snapshot = this.pairs.controls
                .map((c) => ({ key: c.value.key as string, value: c.value.value as string }))
                .filter((item) => item.key?.trim() !== '');
            this.normalModeSnapshot.set(snapshot);

            const testVars = snapshot.map((item) => ({ key: item.key, value: '' }));
            this.testValues.set(testVars);
            this.showTestInputs.set(true);
        } else {
            this.syncTestKeysToNormalMode();
            this.showTestInputs.set(false);
            this.testValues.set([]);
            this.normalModeSnapshot.set([]);
        }
        this.testMode = value;
        this.testModeChange.emit(value);
    }

    canRunTest(): boolean {
        const validTestVars = this.testValues().filter((item) => item.key?.trim() !== '');
        if (validTestVars.length === 0) {
            return true;
        }
        return validTestVars.every((item) => item.value?.trim() !== '');
    }

    onRunTest(): void {
        const inputs = Object.fromEntries(this.testValues().map((item) => [item.key, item.value]));
        this.runTest.emit(inputs);
    }

    addTestVariable(): void {
        this.testValues.update((vars) => [...vars, { key: '', value: '' }]);
    }

    removeTestVariable(index: number): void {
        this.testValues.update((vars) => vars.filter((_, i) => i !== index));
    }

    onTestKeyChange(index: number, newKey: string): void {
        this.testValues.update((vars) => vars.map((v, i) => (i === index ? { ...v, key: newKey } : v)));
    }

    onTestValueChange(index: number, newValue: string): void {
        this.testValues.update((vars) => vars.map((v, i) => (i === index ? { ...v, value: newValue } : v)));
    }

    private syncTestKeysToNormalMode(): void {
        const snapshot = this.normalModeSnapshot();
        const snapshotMap = new Map(snapshot.map((item) => [item.key, item.value]));
        const currentTestKeys = this.testValues().filter((tv) => tv.key?.trim() !== '');

        while (this.pairs.length > 0) {
            this.pairs.removeAt(0);
        }

        for (const testItem of currentTestKeys) {
            const trimmedKey = testItem.key.trim();
            const restoredValue = snapshotMap.has(trimmedKey) ? snapshotMap.get(trimmedKey)! : 'variables.';

            this.pairs.push(
                this.fb.group({
                    key: [trimmedKey],
                    value: [restoredValue],
                })
            );
        }

        if (this.pairs.length === 0) {
            this.addPair();
        }

        this.sidePanelService.triggerAutosave();
    }

    private getValidInputPairs(): AbstractControl[] {
        return this.pairs.controls.filter((control) => {
            const value = control.value;
            return value.key?.trim() !== '';
        });
    }
}
