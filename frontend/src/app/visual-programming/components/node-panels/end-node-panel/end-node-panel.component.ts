import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { EndNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { JsonEditorComponent } from '../../../../shared/components/json-editor/json-editor.component';
import { CommonModule } from '@angular/common';
interface InputMapPair {
    key: string;
    value: string;
}
@Component({
    standalone: true,
    selector: 'app-end-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        JsonEditorComponent,
        CommonModule,
    ],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                <form [formGroup]="form" class="form-container">
                    <!-- Node Name Field -->
                    <app-custom-input
                        label="Node Name"
                        tooltipText="The unique identifier used to reference this End node. This name must be unique within the flow."
                        formControlName="node_name"
                        placeholder="Enter node name"
                        [activeColor]="activeColor"
                        [errorMessage]="getNodeNameErrorMessage()"
                    ></app-custom-input>

                    <!-- Output Map Title -->
                    <div class="output-map-container">
                        <div class="label-container">
                            <label>Output Map</label>
                        </div>
                        <app-json-editor
                            class="json-editor"
                            [jsonData]="outputMapJson"
                            (jsonChange)="onOutputMapChange($event)"
                            (validationChange)="onOutputMapValidChange($event)"
                            [fullHeight]="false"
                        ></app-json-editor>
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
            }

            .section-header {
                @include mixins.section-header;
            }

            .form-container {
                @include mixins.form-container;
            }

            .label-container {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-bottom: 0.25rem;
            }

            .label-container label {
                display: block;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
                margin: 0;
            }

            :host ::ng-deep app-json-editor .editor-header {
                padding-top: 0.25rem;
                padding-bottom: 0.25rem;
            }

            .output-map-container {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
        `,
    ],
})
export class EndNodePanelComponent extends BaseSidePanel<EndNodeModel> {
    constructor() {
        super();
    }

    public get activeColor(): string {
        return this.node().color || '#d3d3d3';
    }

    public outputMapJson: string = '{\n  "context": "variables.context"\n}';
    public isOutputMapValid: boolean = true;

    protected initializeForm(): FormGroup {
        const form = this.fb.group({
            node_name: [this.node().node_name, this.createNodeNameValidators()],
        });

        // Initialize output map JSON from node data or default
        const existingOutputMap = this.node().data?.output_map;
        if (
            existingOutputMap &&
            typeof existingOutputMap === 'object' &&
            Object.keys(existingOutputMap).length > 0
        ) {
            try {
                this.outputMapJson = JSON.stringify(existingOutputMap, null, 2);
            } catch {
                this.outputMapJson = '{\n  "context": "variables.context"\n}';
            }
        } else {
            this.outputMapJson = '{\n  "context": "variables.context"\n}';
        }

        return form;
    }

    protected createUpdatedNode(): EndNodeModel {
        let parsedOutputMap: Record<string, unknown> = {
            context: 'variables.context',
        } as Record<string, unknown>;
        try {
            const parsed = JSON.parse(this.outputMapJson);
            if (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
            ) {
                parsedOutputMap = parsed as Record<string, unknown>;
            }
        } catch {}

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
            data: { output_map: parsedOutputMap },
        };
    }

    public onOutputMapChange(json: string): void {
        this.outputMapJson = json;
    }

    public onOutputMapValidChange(isValid: boolean): void {
        this.isOutputMapValid = isValid;
    }
}
