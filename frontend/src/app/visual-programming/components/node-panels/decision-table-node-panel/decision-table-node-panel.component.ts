import {
    ChangeDetectionStrategy,
    Component,
    input,
    ChangeDetectorRef,
} from '@angular/core';
import {
    ReactiveFormsModule,
    FormGroup,
    FormArray,
    FormBuilder,
    Validators,
} from '@angular/forms';
import { DecisionTableNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { CommonModule } from '@angular/common';
import {
    DecisionTableNode,
    ConditionGroup,
    Condition,
} from '../../../core/models/decision-table.model';

@Component({
    standalone: true,
    selector: 'app-decision-table-node-panel',
    imports: [ReactiveFormsModule, CustomInputComponent, CommonModule],
    template: `
        <div class="panel-container">
            <div class="panel-content">
                @if (form) {
                <form [formGroup]="form" class="form-container">
                    <div class="form-layout expanded">
                        <div class="form-fields">
                            <app-custom-input
                                label="Node Name"
                                tooltipText="The unique identifier used to reference this decision table node. This helps identify the node in your workflow."
                                formControlName="node_name"
                                placeholder="Enter node name"
                                [activeColor]="activeColor"
                                [errorMessage]="getNodeNameErrorMessage()"
                            ></app-custom-input>

                            <app-custom-input
                                label="Default Next Node"
                                tooltipText="The default node to proceed to if no conditions match. This ensures your workflow continues even when no specific conditions are met."
                                formControlName="default_next_node"
                                placeholder="Enter default next node"
                                [activeColor]="activeColor"
                            ></app-custom-input>
                        </div>

                        <div class="condition-groups-section">
                            <div class="section-header">
                                <h3>Condition Groups</h3>
                                <button
                                    type="button"
                                    class="btn-add"
                                    (click)="addConditionGroup()"
                                >
                                    <i class="ti ti-plus"></i>
                                    Add Group
                                </button>
                            </div>

                            <div
                                formArrayName="condition_groups"
                                class="condition-groups"
                            >
                                @for (group of conditionGroups.controls; track
                                $index; let groupIndex = $index) {
                                <div
                                    [formGroupName]="groupIndex"
                                    class="condition-group"
                                >
                                    <div class="group-header">
                                        <div class="group-title">
                                            <h4>Group {{ groupIndex + 1 }}</h4>
                                            <button
                                                type="button"
                                                class="btn-remove"
                                                (click)="
                                                    removeConditionGroup(
                                                        groupIndex
                                                    )
                                                "
                                                title="Remove Group"
                                            >
                                                <i class="ti ti-trash"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <div class="group-content">
                                        <div class="group-fields">
                                            <app-custom-input
                                                label="Group Name"
                                                tooltipText="A descriptive name for this condition group to help identify its purpose."
                                                formControlName="group_name"
                                                placeholder="Enter group name"
                                                [activeColor]="activeColor"
                                            ></app-custom-input>

                                            <div class="select-wrapper">
                                                <label>Group Type</label>
                                                <select
                                                    formControlName="group_type"
                                                    class="group-type-select"
                                                >
                                                    <option value="simple">
                                                        Simple
                                                    </option>
                                                    <option value="complex">
                                                        Complex
                                                    </option>
                                                </select>
                                            </div>

                                            <app-custom-input
                                                label="Expression"
                                                tooltipText="A logical expression that combines multiple conditions in this group. Use operators like AND, OR, NOT to create complex conditions."
                                                formControlName="expression"
                                                placeholder="Enter expression"
                                                [activeColor]="activeColor"
                                            ></app-custom-input>

                                            <app-custom-input
                                                label="Manipulation"
                                                tooltipText="The action or manipulation to perform when this condition group is satisfied. This could be data transformation, API calls, or other operations."
                                                formControlName="manipulation"
                                                placeholder="Enter manipulation"
                                                [activeColor]="activeColor"
                                            ></app-custom-input>

                                            <app-custom-input
                                                label="Next Node"
                                                tooltipText="The next node in your workflow to execute when this condition group is met. This determines the flow path after successful condition evaluation."
                                                formControlName="next_node"
                                                placeholder="Enter next node"
                                                [activeColor]="activeColor"
                                            ></app-custom-input>
                                        </div>

                                        <div class="conditions-section">
                                            <div class="conditions-header">
                                                <h5>Conditions</h5>
                                                <button
                                                    type="button"
                                                    class="btn-add-condition"
                                                    (click)="
                                                        addCondition(groupIndex)
                                                    "
                                                >
                                                    <i class="ti ti-plus"></i>
                                                    Add Condition
                                                </button>
                                            </div>

                                            <div
                                                formArrayName="conditions"
                                                class="conditions-list"
                                            >
                                                @for (condition of
                                                getConditionsArray(groupIndex).controls;
                                                track condition.value.id; let
                                                conditionIndex = $index) {
                                                <div
                                                    [formGroupName]="
                                                        conditionIndex
                                                    "
                                                    class="condition-row"
                                                >
                                                    <div
                                                        class="condition-content"
                                                    >
                                                        <app-custom-input
                                                            label="Condition Name"
                                                            tooltipText="A descriptive name for this specific condition within the group. This helps identify what the condition checks for."
                                                            formControlName="condition_name"
                                                            placeholder="Enter condition name"
                                                            [activeColor]="
                                                                activeColor
                                                            "
                                                        ></app-custom-input>

                                                        <app-custom-input
                                                            label="Condition"
                                                            tooltipText="The actual condition logic or expression to evaluate. This defines the criteria that must be met for the condition to be true."
                                                            formControlName="condition"
                                                            placeholder="Enter condition"
                                                            [activeColor]="
                                                                activeColor
                                                            "
                                                        ></app-custom-input>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        class="btn-remove-condition"
                                                        (click)="
                                                            removeCondition(
                                                                groupIndex,
                                                                conditionIndex
                                                            )
                                                        "
                                                        title="Remove Condition"
                                                    >
                                                        <i
                                                            class="ti ti-trash"
                                                        ></i>
                                                    </button>
                                                </div>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                }
                            </div>
                        </div>
                    </div>
                </form>
                }
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

                &.expanded {
                    display: flex;
                    gap: 1.5rem;
                    height: 100%;
                }
            }

            .form-fields {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                flex: 0 0 300px;
                max-width: 300px;
                height: 100%;
                overflow-y: auto;
            }

            .condition-groups-section {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);

                h3 {
                    margin: 0;
                    color: #ffffff;
                    font-size: 1.1rem;
                    font-weight: 600;
                }
            }

            .btn-add {
                @include mixins.primary-button;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 1rem;
                font-size: 0.9rem;

                i {
                    font-size: 0.8rem;
                }
            }

            .condition-groups {
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
                flex: 1;
                overflow-y: auto;
                padding-right: 0.5rem;
            }

            .condition-group {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 1.5rem;
                transition: all 0.2s ease;

                &:hover {
                    border-color: rgba(255, 255, 255, 0.2);
                    background: rgba(255, 255, 255, 0.08);
                }
            }

            .group-header {
                margin-bottom: 1.5rem;
            }

            .group-title {
                display: flex;
                justify-content: space-between;
                align-items: center;

                h4 {
                    margin: 0;
                    color: #ffffff;
                    font-size: 1rem;
                    font-weight: 600;
                }
            }

            .btn-remove {
                background: rgba(255, 59, 48, 0.2);
                border: 1px solid rgba(255, 59, 48, 0.3);
                color: #ff3b30;
                border-radius: 6px;
                padding: 0.5rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;

                &:hover {
                    background: rgba(255, 59, 48, 0.3);
                    border-color: rgba(255, 59, 48, 0.5);
                }

                i {
                    font-size: 0.9rem;
                }
            }

            .group-content {
                display: flex;
                flex-direction: column;
                gap: 1.5rem;
            }

            .group-fields {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }

            .select-wrapper {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;

                label {
                    color: #ffffff;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
            }

            .group-type-select {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #ffffff;
                padding: 0.75rem;
                font-size: 0.9rem;
                transition: all 0.2s ease;

                &:focus {
                    outline: none;
                    border-color: #685fff;
                    box-shadow: 0 0 0 2px rgba(104, 95, 255, 0.2);
                }

                option {
                    background: #1a1a1a;
                    color: #ffffff;
                }
            }

            .conditions-section {
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 1.5rem;
            }

            .conditions-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;

                h5 {
                    margin: 0;
                    color: #ffffff;
                    font-size: 0.95rem;
                    font-weight: 600;
                }
            }

            .btn-add-condition {
                @include mixins.primary-button;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.4rem 0.8rem;
                font-size: 0.8rem;

                i {
                    font-size: 0.7rem;
                }
            }

            .conditions-list {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }

            .condition-row {
                display: flex;
                align-items: flex-start;
                gap: 1rem;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 1rem;
                transition: all 0.2s ease;

                &:hover {
                    border-color: rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.05);
                }
            }

            .condition-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }

            .btn-remove-condition {
                background: rgba(255, 59, 48, 0.2);
                border: 1px solid rgba(255, 59, 48, 0.3);
                color: #ff3b30;
                border-radius: 6px;
                padding: 0.4rem;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                margin-top: 0.5rem;

                &:hover {
                    background: rgba(255, 59, 48, 0.3);
                    border-color: rgba(255, 59, 48, 0.5);
                }

                i {
                    font-size: 0.8rem;
                }
            }

            /* Scrollbar styling */
            .condition-groups::-webkit-scrollbar,
            .form-fields::-webkit-scrollbar {
                width: 6px;
            }

            .condition-groups::-webkit-scrollbar-track,
            .form-fields::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
            }

            .condition-groups::-webkit-scrollbar-thumb,
            .form-fields::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;

                &:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableNodePanelComponent extends BaseSidePanel<DecisionTableNodeModel> {
    public readonly isExpanded = input<boolean>(true);

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    get conditionGroups(): FormArray {
        return this.form?.get('condition_groups') as FormArray;
    }

    getConditionsArray(groupIndex: number): FormArray {
        const group = this.conditionGroups?.at(groupIndex);
        return group?.get('conditions') as FormArray;
    }

    initializeForm(): FormGroup {
        const node = this.node();
        const decisionTableData = (node.data as any).table as DecisionTableNode;

        const form = this.fb.group({
            node_name: [node.node_name, this.createNodeNameValidators()],
            default_next_node: [decisionTableData.default_next_node || ''],
            condition_groups: this.fb.array([]),
        });

        this.initializeConditionGroups(
            form,
            decisionTableData.condition_groups || []
        );

        return form;
    }

    createUpdatedNode(): DecisionTableNodeModel {
        const conditionGroups = this.conditionGroups.value.map(
            (group: any) => ({
                group_name: group.group_name || '',
                group_type: group.group_type || 'simple',
                expression: group.expression || null,
                conditions: (group.conditions || []).map((condition: any) => ({
                    condition_name: condition.condition_name,
                    condition: condition.condition,
                })),
                manipulation: group.manipulation || null,
                next_node: group.next_node || null,
            })
        );

        const decisionTableData: DecisionTableNode = {
            graph: null,
            node_name: this.form.value.node_name,
            default_next_node: this.form.value.default_next_node || null,
            condition_groups: conditionGroups,
        };

        return {
            ...this.node(),
            node_name: this.form.value.node_name,
            data: {
                name: this.form.value.node_name || 'Decision Table',
                table: decisionTableData,
            },
        };
    }

    addConditionGroup(): void {
        if (!this.conditionGroups) return;

        const conditionGroup = this.fb.group({
            group_name: ['', Validators.required],
            group_type: ['simple', Validators.required],
            expression: [''],
            manipulation: [''],
            next_node: [''],
            conditions: this.fb.array([]),
        });

        this.conditionGroups.push(conditionGroup);
        this.cdr.markForCheck();
    }

    removeConditionGroup(index: number): void {
        if (!this.conditionGroups || this.conditionGroups.length <= index)
            return;
        this.conditionGroups.removeAt(index);
        this.cdr.markForCheck();
    }

    addCondition(groupIndex: number): void {
        const group = this.conditionGroups.at(groupIndex);
        if (!group) return;

        const conditionsArray = group.get('conditions') as FormArray;
        const newCondition = this.fb.group({
            id: [Date.now() + Math.random()], // Unique ID for tracking
            condition_name: ['', Validators.required],
            condition: ['', Validators.required],
        });

        conditionsArray.push(newCondition);
        this.cdr.markForCheck();
    }

    removeCondition(groupIndex: number, conditionIndex: number): void {
        const group = this.conditionGroups.at(groupIndex);
        if (!group) return;

        const conditionsArray = group.get('conditions') as FormArray;
        if (conditionsArray.length <= conditionIndex) return;

        conditionsArray.removeAt(conditionIndex);
        this.cdr.markForCheck();
    }

    private initializeConditionGroups(
        form: FormGroup,
        conditionGroups: ConditionGroup[]
    ): void {
        const conditionGroupsArray = form.get('condition_groups') as FormArray;

        if (conditionGroups && conditionGroups.length > 0) {
            conditionGroups.forEach((group) => {
                const conditionsArray = this.fb.array([]) as FormArray;

                if (group.conditions && group.conditions.length > 0) {
                    group.conditions.forEach((condition) => {
                        const conditionGroup = this.fb.group({
                            id: [Date.now() + Math.random()], // Unique ID for tracking
                            condition_name: [
                                condition.condition_name,
                                Validators.required,
                            ],
                            condition: [
                                condition.condition,
                                Validators.required,
                            ],
                        });
                        conditionsArray.push(conditionGroup);
                    });
                }

                const groupForm = this.fb.group({
                    group_name: [group.group_name, Validators.required],
                    group_type: [group.group_type, Validators.required],
                    expression: [group.expression || ''],
                    manipulation: [group.manipulation || ''],
                    next_node: [group.next_node || ''],
                    conditions: conditionsArray,
                });
                conditionGroupsArray.push(groupForm);
            });
        } else {
            this.addConditionGroup();
        }
    }
}
