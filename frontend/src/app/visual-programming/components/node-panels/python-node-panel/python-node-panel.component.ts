import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, input, signal } from '@angular/core';
import { inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, switchMap } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { expandCollapseAnimation } from '../../../../shared/animations/animations-expand-collapse';
import { AppSvgIconComponent } from '../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { CodeEditorComponent } from '../../../../user-settings-page/tools/custom-tool-editor/code-editor/code-editor.component';
import { PythonNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import {
    PollEvent,
    PythonCodeResult,
    PythonCodeRunService,
    RunPythonCodeRequest,
} from '../../../services/python-code-run.service';
import { SidePanelService } from '../../../services/side-panel.service';
import { InputMapComponent } from '../../input-map/input-map.component';
import { PythonTerminalComponent } from './python-terminal/python-terminal.component';
import { TerminalLogEntry, TerminalLogType } from './python-terminal/terminal-log.model';

interface InputMapPair {
    key: string;
    value: string;
}

@Component({
    standalone: true,
    selector: 'app-python-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        InputMapComponent,
        CodeEditorComponent,
        CommonModule,
        PythonTerminalComponent,
        AppSvgIconComponent,
    ],
    animations: [expandCollapseAnimation],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                <form [formGroup]="form" class="form-container">
                    <div
                        class="form-layout"
                        [class.expanded]="isExpanded()"
                        [class.collapsed]="!isExpanded()"
                        [class.code-editor-fullwidth]="isExpanded() && isCodeEditorFullWidth()"
                    >
                        <!-- Form Fields (stable single instance) -->
                        <div class="form-fields">
                            <app-custom-input
                                label="Node Name"
                                tooltipText="The unique identifier used to reference this Python node. This name must be unique within the flow."
                                formControlName="node_name"
                                placeholder="Enter node name"
                                [activeColor]="activeColor"
                                [errorMessage]="getNodeNameErrorMessage()"
                            ></app-custom-input>

                            <div class="input-map">
                                <app-input-map
                                    [activeColor]="activeColor"
                                    [testMode]="isOpenTestMode()"
                                    [pythonNodeId]="node().backendId"
                                    (testModeChange)="isOpenTestMode.set($event)"
                                    (runTest)="onRunTest($event)"
                                ></app-input-map>
                            </div>

                            <app-custom-input
                                label="Output Variable Path"
                                tooltipText="The path where the output of this node will be stored in your flow variables. Leave empty if you don't need to store the output."
                                formControlName="output_variable_path"
                                placeholder="Enter output variable path (leave empty for null)"
                                [activeColor]="activeColor"
                            ></app-custom-input>

                            <app-custom-input
                                label="Libraries"
                                tooltipText="Python libraries required by this code (comma-separated). For example: requests, pandas, numpy"
                                formControlName="libraries"
                                placeholder="Enter libraries (e.g., requests, pandas, numpy)"
                                [activeColor]="activeColor"
                            ></app-custom-input>

                            <div class="stream-config-section" formGroupName="stream_config">
                                <span class="section-label">Streaming to EpicChat</span>
                                <div class="checkbox-list">
                                    <label class="checkbox-item">
                                        <input
                                            type="checkbox"
                                            formControlName="execution_status"
                                            [style.accent-color]="activeColor"
                                        />
                                        <span>Execution status</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Code editor area: toggle button only present in expanded mode -->
                        <div class="code-editor-wrapper">
                            @if (isExpanded()) {
                                <button
                                    type="button"
                                    class="toggle-icon-button"
                                    (click)="toggleCodeEditorFullWidth()"
                                    [attr.aria-label]="
                                        isCodeEditorFullWidth() ? 'Collapse code editor' : 'Expand code editor'
                                    "
                                >
                                    <app-svg-icon
                                        [icon]="isCodeEditorFullWidth() ? 'chevron-left' : 'chevron-right'"
                                        size="1rem"
                                    ></app-svg-icon>
                                </button>
                            }

                            <div class="code-editor-column">
                                <app-code-editor
                                    class="code-editor-section"
                                    [class.no-bottom-radius]="isOpenTestMode()"
                                    [pythonCode]="pythonCode"
                                    (pythonCodeChange)="onPythonCodeChange($event)"
                                    (errorChange)="onCodeErrorChange($event)"
                                ></app-code-editor>

                                @if (isOpenTestMode()) {
                                    <app-python-terminal
                                        [logs]="terminalLogs()"
                                        [terminalHeight]="terminalHeight()"
                                        (heightChange)="onTerminalHeightChange($event)"
                                        (clearLogs)="onClearLogs()"
                                    />
                                }
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `,
    styles: [
        `
            @use '../../../styles/node-panel-mixins.scss' as mixins;

            .panel-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
            }

            .panel-content {
                @include mixins.panel-content;
                height: 100%;
                min-height: 0;
                display: flex;
                flex-direction: column;
            }

            .section-header {
                @include mixins.section-header;
            }

            .form-container {
                @include mixins.form-container;
                height: 100%;
                min-height: 0;
                display: flex;
                flex-direction: column;
            }

            .form-layout {
                height: 100%;
                min-height: 0;
                width: 100%;
                overflow: hidden;

                &.expanded {
                    display: flex;
                    gap: 1rem;
                    height: 100%;
                    width: 100%;

                    &.code-editor-fullwidth {
                        overflow: visible;

                        .form-fields {
                            display: none;
                        }

                        .code-editor-wrapper {
                            width: 100%;
                        }

                        .toggle-icon-button {
                            position: absolute;
                            left: 0;
                            top: 50%;
                            transform: translateY(-50%);
                            z-index: 10;
                            border-width: 1px 1px 1px 0px;
                            border-radius: 0 8px 8px 0;
                        }
                    }
                }

                &.collapsed {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    overflow: visible;

                    .form-fields {
                        flex: 1 1 auto;
                        max-width: none;
                        height: auto;
                        overflow-y: visible;
                    }

                    .code-editor-wrapper {
                        flex: 0 0 auto;
                        height: auto;
                        display: block;
                        transition: none;
                    }
                }
            }

            .form-fields {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                flex: 0 0 400px;
                max-width: 400px;
                height: 100%;
                overflow-y: auto;
            }

            .code-editor-wrapper {
                display: flex;
                align-items: center;
                gap: 0;
                height: 100%;
                position: relative;
                flex: 1;
                min-height: 0;
                min-width: 0;
                transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);

                .toggle-icon-button {
                    flex-shrink: 0;
                    width: 28px;
                    height: 66px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-width: 1px 0px 1px 1px;
                    border-style: solid;
                    border-color: #2c2c2e;
                    background: transparent;
                    cursor: pointer;
                    border-radius: 8px 0 0 8px;
                    transition: all 0.2s ease;
                    padding: 0;
                    color: #d9d9d999;

                    &:hover:not(:disabled) {
                        color: #d9d9d9;
                        background: #2c2c2e;
                    }

                    &:active:not(:disabled) {
                        color: #d9d9d9;
                    }

                    &:disabled {
                        cursor: not-allowed;
                        opacity: 0.5;
                    }
                }

                app-code-editor {
                    min-width: 0;
                }
            }

            .code-editor-column {
                align-self: stretch;
                display: flex;
                flex-direction: column;
                flex: 1;
                min-height: 0;
                min-width: 0;
            }

            .code-editor-section {
                border: 1px solid var(--color-divider-subtle, rgba(255, 255, 255, 0.1));
                border-radius: 0 8px 8px 0;

                &.no-bottom-radius {
                    border-bottom-left-radius: 0;
                    border-bottom-right-radius: 0;
                }
                overflow: visible;
                display: flex;
                flex-direction: column;

                .expanded & {
                    flex: 1;
                    height: 100%;
                    min-height: 0;
                    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                    transform: scaleX(0.3) translateX(-50px);
                    opacity: 0;
                }

                .collapsed & {
                    height: 300px;
                    flex-shrink: 0;
                }

                .form-layout.expanded:not(.code-editor-fullwidth) & {
                    transform: scaleX(1) translateX(0);
                    opacity: 1;
                }

                .form-layout.expanded.code-editor-fullwidth & {
                    transform: scaleX(1) translateX(0);
                    opacity: 1;
                    overflow: visible;
                }
            }

            .btn-primary {
                @include mixins.primary-button;
            }

            .btn-secondary {
                @include mixins.secondary-button;
            }

            .section-label {
                font-size: 0.75rem;
                color: #d9d9d999;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .stream-config-section {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .checkbox-list {
                display: flex;
                flex-direction: column;
                gap: 0.35rem;
            }

            .checkbox-item {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 0.85rem;
                color: #d4d4d4;
                cursor: pointer;

                input[type='checkbox'] {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                }
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PythonNodePanelComponent extends BaseSidePanel<PythonNodeModel> {
    public override readonly isExpanded = input<boolean>(false);
    public readonly isCodeEditorFullWidth = signal<boolean>(true);

    isOpenTestMode = signal(false);
    testResult = signal<PythonCodeResult | null>(null);
    testError = signal<string | null>(null);
    testRunning = signal(false);
    terminalLogs = signal<TerminalLogEntry[]>([]);
    terminalHeight = signal<number>(150);

    pythonCode: string = '';
    initialPythonCode: string = '';
    codeEditorHasError: boolean = false;
    private readonly pythonCodeChange$ = new Subject<string>();
    private readonly destroyRef = inject(DestroyRef);

    constructor(
        private readonly sidePanelService: SidePanelService,
        private readonly pythonCodeRunService: PythonCodeRunService
    ) {
        super();
        this.pythonCodeChange$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
            this.sidePanelService.triggerAutosave();
        });
        effect(() => {
            if (this.isOpenTestMode()) {
                this.sidePanelService.requestExpand();
                this.isCodeEditorFullWidth.set(false);
            }
        });
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    get inputMapPairs(): FormArray {
        return this.form.get('input_map') as FormArray;
    }

    onPythonCodeChange(code: string): void {
        this.pythonCode = code;
        this.pythonCodeChange$.next(code);
    }

    onCodeErrorChange(hasError: boolean): void {
        this.codeEditorHasError = hasError;
    }

    initializeForm(): FormGroup {
        this.terminalLogs.set([]);
        const sc = this.node().stream_config;
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            input_map: this.fb.array([]),
            output_variable_path: [this.node().output_variable_path || ''],
            libraries: [this.node().data.libraries?.join(', ') || ''],
            stream_config: this.fb.group({
                execution_status: [sc?.['execution_status'] ?? true],
            }),
        });

        this.initializeInputMap(form);

        this.pythonCode = this.node().data.code || '';
        this.initialPythonCode = this.pythonCode;

        return form;
    }

    createUpdatedNode(): PythonNodeModel {
        const validInputPairs = this.getValidInputPairs();
        const inputMapValue = this.createInputMapFromPairs(validInputPairs);

        const librariesArray = this.form.value.libraries
            ? this.form.value.libraries
                  .split(',')
                  .map((lib: string) => lib.trim())
                  .filter((lib: string) => lib.length > 0)
            : [];

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
            input_map: inputMapValue,
            output_variable_path: this.form.value.output_variable_path || null,
            data: {
                ...this.node().data,
                name: this.node().data.name || 'Python Code',
                code: this.pythonCode,
                entrypoint: 'main',
                libraries: librariesArray,
            },
            stream_config: this.form.value.stream_config || {},
        };
    }

    private initializeInputMap(form: FormGroup): void {
        const inputMapArray = form.get('input_map') as FormArray;

        if (this.node().input_map && Object.keys(this.node().input_map).length > 0) {
            Object.entries(this.node().input_map).forEach(([key, value]) => {
                inputMapArray.push(
                    this.fb.group({
                        key: [key, Validators.required],
                        value: [value, Validators.required],
                    })
                );
            });
        } else {
            inputMapArray.push(
                this.fb.group({
                    key: [''],
                    value: ['variables.'],
                })
            );
        }
    }

    private getValidInputPairs(): AbstractControl[] {
        return this.inputMapPairs.controls.filter((control) => {
            const value = control.value as InputMapPair;
            return value.key?.trim() !== '' || value.value?.trim() !== '';
        });
    }

    private createInputMapFromPairs(pairs: AbstractControl[]): Record<string, string> {
        return pairs.reduce((acc: Record<string, string>, curr: AbstractControl) => {
            const pair = curr.value as InputMapPair;
            if (pair.key?.trim()) {
                acc[pair.key.trim()] = pair.value;
            }
            return acc;
        }, {});
    }

    toggleCodeEditorFullWidth(): void {
        this.isCodeEditorFullWidth.update((value) => !value);
    }

    onTerminalHeightChange(height: number): void {
        this.terminalHeight.set(height);
    }

    onClearLogs(): void {
        this.terminalLogs.set([]);
    }

    private addLog(type: TerminalLogType, message: string): void {
        this.terminalLogs.update((logs) => [...logs, { timestamp: new Date(), type, message }]);
    }

    private parseVariableValue(raw: string): unknown {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    onRunTest(variables: Record<string, string>): void {
        this.testRunning.set(true);
        this.testResult.set(null);
        this.testError.set(null);
        this.terminalLogs.set([]);

        this.addLog('info', 'Starting function main()...');

        const libraries = this.form.value.libraries
            ? this.form.value.libraries
                  .split(',')
                  .map((lib: string) => lib.trim())
                  .filter((lib: string) => lib.length > 0)
            : [];

        const parsedVariables = Object.fromEntries(
            Object.entries(variables).map(([k, v]) => [k, this.parseVariableValue(v)])
        );

        const payload: RunPythonCodeRequest = {
            python_code_id: this.node().data.id ?? null,
            code: this.pythonCode,
            entrypoint: 'main',
            libraries,
            variables: parsedVariables,
        };

        this.addLog('info', `Parameters: ${JSON.stringify(parsedVariables)}`);

        this.pythonCodeRunService
            .runPythonCode(payload)
            .pipe(
                switchMap(({ execution_id }) => this.pythonCodeRunService.pollResultWithEvents(execution_id)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: (event: PollEvent) => {
                    if (event.type === 'polling') {
                        this.addLog('polling', 'Processing...');
                    } else if (event.type === 'result') {
                        const result = event.data;
                        this.testResult.set(result);
                        this.testRunning.set(false);

                        if (result.stdout) {
                            this.addLog('stdout', result.stdout);
                        }
                        if (result.stderr) {
                            this.addLog('stderr', result.stderr);
                        }
                        if (result.returncode === 0) {
                            this.addLog('result', result.result_data || '(empty result)');
                        } else {
                            this.addLog('error', `Execution failed (return code: ${result.returncode})`);
                        }
                    }
                },
                error: (err: Error) => {
                    this.testError.set(err.message || 'Unknown error');
                    this.testRunning.set(false);
                    this.addLog('error', `Error: ${err.message || 'Unknown error'}`);
                },
            });
    }
}
