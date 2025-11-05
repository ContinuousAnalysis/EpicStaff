import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
    ReactiveFormsModule,
    FormGroup,
    Validators,
    FormArray,
    FormBuilder,
} from '@angular/forms';
import { PythonNodeModel, WebhookTriggerNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { InputMapComponent } from '../../input-map/input-map.component';
import { CodeEditorComponent } from '../../../../user-settings-page/tools/custom-tool-editor/code-editor/code-editor.component';
import { CommonModule } from '@angular/common';
import { WebhookTriggerNodeService } from '../../../../pages/flows-page/components/flow-visual-programming/services/webhook-trigger.service';
import { WebhookTriggersArray } from './models/webhook-triggers.models';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

interface InputMapPair {
    key: string;
    value: string;
}

@Component({
    standalone: true,
    selector: 'app-webhook-trigger-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        InputMapComponent,
        CodeEditorComponent,
        CommonModule,
        HelpTooltipComponent,
    ],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                <form [formGroup]="form" class="form-container">
                    <!-- Node Name Field -->
                    <app-custom-input
                        label="Node Name"
                        tooltipText="The unique identifier used to reference this Python node. This name must be unique within the flow."
                        formControlName="node_name"
                        placeholder="Enter node name"
                        [activeColor]="activeColor"
                        [errorMessage]="getNodeNameErrorMessage()"
                    ></app-custom-input>

                    <!-- Input Map Key-Value Pairs -->
                    <div class="input-map">
                        <app-input-map
                            [activeColor]="activeColor"
                        ></app-input-map>
                    </div>

                    <!-- Output Variable Path -->
                    <app-custom-input
                        label="Output Variable Path"
                        tooltipText="The path where the output of this node will be stored in your flow variables. Leave empty if you don't need to store the output."
                        formControlName="output_variable_path"
                        placeholder="Enter output variable path (leave empty for null)"
                        [activeColor]="activeColor"
                    ></app-custom-input>

                    <!-- Webhook Trigger Selector -->
                    <!-- <div class="form-group">
                        <div class="label-container">
                            <label>Webhook Trigger</label>
                            <app-help-tooltip
                                text="Select the webhook trigger to associate with this node."
                                position="right"
                            ></app-help-tooltip>
                        </div>
                        <select
                            formControlName="webhookTriggerId"
                            class="text-input"
                            [style.--active-color]="activeColor"
                        >
                            <option [ngValue]="null">Select webhook trigger (id)</option>
                            <option *ngFor="let trigger of webhookTriggers" [ngValue]="trigger.id">
                                {{ trigger.id }}
                            </option>
                        </select>
                    </div> -->

                    <!-- Code Editor Component -->
                    <div class="code-editor-section">
                        <app-code-editor
                            [pythonCode]="pythonCode"
                            (pythonCodeChange)="onPythonCodeChange($event)"
                            (errorChange)="onCodeErrorChange($event)"
                        ></app-code-editor>
                    </div>

                    <!-- Libraries Input -->
                    <app-custom-input
                        label="Libraries"
                        tooltipText="Python libraries required by this code (comma-separated). For example: requests, pandas, numpy"
                        formControlName="libraries"
                        placeholder="Enter libraries (e.g., requests, pandas, numpy)"
                        [activeColor]="activeColor"
                    ></app-custom-input>
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
            }

            .section-header {
                @include mixins.section-header;
            }

            .form-container {
                @include mixins.form-container;
            }

            .btn-primary {
                @include mixins.primary-button;
            }

            .btn-secondary {
                @include mixins.secondary-button;
            }

            .code-editor-section {
                height: 300px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                overflow: hidden;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebhookTriggerNodePanelComponent extends BaseSidePanel<WebhookTriggerNodeModel> {
    pythonCode: string = '';
    initialPythonCode: string = '';
    codeEditorHasError: boolean = false;
    webhookTriggers: WebhookTriggersArray = [];
    
    constructor(private webhookTriggerNodeService: WebhookTriggerNodeService) {
        super();
        // Load webhook triggers on component init
        this.webhookTriggerNodeService.getWebhookTriggersRequest()
            .subscribe(res => this.webhookTriggers = res.results);
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    get inputMapPairs(): FormArray {
        return this.form.get('input_map') as FormArray;
    }

    onPythonCodeChange(code: string): void {
        this.pythonCode = code;
    }

    onCodeErrorChange(hasError: boolean): void {
        this.codeEditorHasError = hasError;
    }

    initializeForm(): FormGroup {
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
            input_map: this.fb.array([]),
            output_variable_path: [this.node().output_variable_path || ''],
            libraries: [this.node().data.python_code.libraries?.join(', ') || ''],
            webhookTriggerId: [this.node().data.webhook_trigger || null],
        });

        this.initializeInputMap(form);
        // options are loaded by the CustomSelectComponent via optionsRequest
        this.pythonCode = this.node().data.python_code.code || '';
        this.initialPythonCode = this.pythonCode;
        return form;
    }

    createUpdatedNode(): WebhookTriggerNodeModel {
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
                webhook_trigger: this.form.value.webhookTriggerId,
                python_code: {
                    name: this.node().data.python_code.name || 'Python Code',
                    code: this.pythonCode,
                    entrypoint: 'main',
                    libraries: librariesArray,
                }
            },
        };
    }

    private initializeInputMap(form: FormGroup): void {
        const inputMapArray = form.get('input_map') as FormArray;

        if (
            this.node().input_map &&
            Object.keys(this.node().input_map).length > 0
        ) {
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

    private getValidInputPairs(): any[] {
        return this.inputMapPairs.controls.filter((control) => {
            const value = control.value;
            return value.key?.trim() !== '' || value.value?.trim() !== '';
        });
    }

    private createInputMapFromPairs(pairs: any[]): Record<string, string> {
        return pairs.reduce((acc: Record<string, string>, curr: any) => {
            const pair = curr.value as InputMapPair;
            if (pair.key?.trim()) {
                acc[pair.key.trim()] = pair.value;
            }
            return acc;
        }, {});
    }
}
