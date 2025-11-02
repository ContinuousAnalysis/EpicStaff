import { ChangeDetectionStrategy, Component, signal, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { SubGraphNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CommonModule } from '@angular/common';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { FlowsApiService } from '../../../../features/flows/services/flows-api.service';
import { GraphDto } from '../../../../features/flows/models/graph.model';

@Component({
    standalone: true,
    selector: 'app-subgraph-node-panel',
    imports: [ReactiveFormsModule, CommonModule, CustomInputComponent],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                <form [formGroup]="form" class="form-container">
                    <app-custom-input
                        label="Node Name"
                        tooltipText="The unique identifier used to reference this subgraph node. This name must be unique within the flow."
                        formControlName="node_name"
                        placeholder="Enter node name"
                        [activeColor]="activeColor"
                        [errorMessage]="getNodeNameErrorMessage()"
                    ></app-custom-input>

                    <div class="field">
                        <label>
                            Selected Flow
                            <i class="ti ti-help-circle tooltip-icon" title="Select the flow that this node will execute"></i>
                        </label>
                        <select
                            formControlName="selectedFlowId"
                            class="select-field"
                            (change)="onFlowChange()"
                        >
                            <option [value]="null" disabled>Select a flow</option>
                            @for (flow of availableFlows(); track flow.id) {
                            <option [value]="flow.id">{{ flow.name }}</option>
                            }
                        </select>
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

            .form-container {
                @include mixins.form-container;
            }

            .field {
                display: flex;
                flex-direction: column;
            
            }

            .field label {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 14px;
                color: rgba(255, 255, 255, 0.7);
                font-weight: 500;
                margin-bottom: 0.5rem;
            }

            .tooltip-icon {
                font-size: 16px;
                color: rgba(255, 255, 255, 0.5);
                cursor: help;
            }

            .select-field {
                width: 100%;
                padding: 0.5rem;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.9);
                font-size: 14px;
                transition: border-color 0.2s ease;
                cursor: pointer;
            }

            .select-field:focus {
                outline: none;
                border-color: #00bfa5;
            }

            .select-field option {
                background: #1a1a1a;
                color: rgba(255, 255, 255, 0.9);
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubGraphNodePanelComponent extends BaseSidePanel<SubGraphNodeModel> implements OnInit {
    private flowsApiService = inject(FlowsApiService);
    
    public availableFlows = signal<GraphDto[]>([]);

    constructor() {
        super();
    }

    public get activeColor(): string {
        return this.node().color || '#00bfa5';
    }

    ngOnInit(): void {
        this.flowsApiService.getGraphsLight().subscribe({
            next: (flows: any[]) => {
                this.availableFlows.set(flows);
            },
            error: (err) => console.error('Error fetching flows:', err),
        });
    }

    protected initializeForm(): FormGroup {
        return this.fb.group({
            node_name: [this.node().node_name || '', this.createNodeNameValidators()],
            selectedFlowId: [this.node().data.id, Validators.required],
        });
    }

    public onFlowChange(): void {
    }

    protected createUpdatedNode(): SubGraphNodeModel {
        const selectedId = this.form.get('selectedFlowId')?.value;
        const selectedFlow = this.availableFlows().find(f => f.id === Number(selectedId));
        
        let updatedData = this.node().data;
        if (selectedFlow) {
            updatedData = {
                id: selectedFlow.id,
                name: selectedFlow.name,
                description: selectedFlow.description,
                tags: selectedFlow.tags || [],
            };
        }

        return {
            ...this.node(),
            node_name: this.form.get('node_name')?.value || this.node().node_name,
            data: updatedData,
        };
    }
}

