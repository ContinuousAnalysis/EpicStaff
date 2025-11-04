import {
    ChangeDetectionStrategy,
    Component,
    input,
    ChangeDetectorRef,
    signal,
    computed,
    inject,
    effect,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { DecisionTableNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { CommonModule } from '@angular/common';
import {
    DecisionTableNode,
    ConditionGroup,
} from '../../../core/models/decision-table.model';
import { DecisionTableGridComponent } from './decision-table-grid/decision-table-grid.component';
import { FlowService } from '../../../services/flow.service';
import { NodeType } from '../../../core/enums/node-type';
import { generatePortsForDecisionTableNode } from '../../../core/helpers/helpers';
import { ConnectionModel } from '../../../core/models/connection.model';
import { CustomPortId } from '../../../core/models/port.model';

@Component({
    standalone: true,
    selector: 'app-decision-table-node-panel',
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        CommonModule,
        DecisionTableGridComponent,
    ],
    templateUrl: './decision-table-node-panel.component.html',
    styleUrls: ['./decision-table-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableNodePanelComponent extends BaseSidePanel<DecisionTableNodeModel> {
    public readonly isExpanded = input<boolean>(true);

    private flowService = inject(FlowService);
    private cdr = inject(ChangeDetectorRef);

    public conditionGroups = signal<ConditionGroup[]>([]);

    public availableNodes = computed(() => {
        const nodes = this.flowService.nodes();
        const currentNodeId = this.node().id;
        
        return nodes
            .filter((node) => 
                node.type !== NodeType.NOTE && 
                node.type !== NodeType.START &&
                node.id !== currentNodeId
            )
            .map((node) => ({
                value: node.node_name || node.id,
                label: node.node_name || node.id,
            }));
    });

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    initializeForm(): FormGroup {
        const node = this.node();
        const decisionTableData = (node.data as any).table as DecisionTableNode;

        const form = this.fb.group({
            node_name: [node.node_name, this.createNodeNameValidators()],
            default_next_node: [decisionTableData.default_next_node || ''],
            error_next_node: [decisionTableData.error_next_node || ''],
        });

        this.conditionGroups.set(decisionTableData.condition_groups || []);

        return form;
    }

    createUpdatedNode(): DecisionTableNodeModel {
        const currentNode = this.node();
        const conditionGroups = this.conditionGroups() || [];

        const decisionTableData: DecisionTableNode = {
            default_next_node: this.form.value.default_next_node || null,
            error_next_node: this.form.value.error_next_node || null,
            condition_groups: conditionGroups,
        };

        const headerHeight = 60;
        const rowHeight = 46;
        const validGroupsCount = conditionGroups.filter(g => g.valid).length;
        const hasDefaultRow = decisionTableData.default_next_node ? 1 : 0;
        const hasErrorRow = decisionTableData.error_next_node ? 1 : 0;
        const totalRows = Math.max(validGroupsCount + hasDefaultRow + hasErrorRow, 2);
        const calculatedHeight = headerHeight + rowHeight * totalRows;

        const updatedSize = {
            width: currentNode.size?.width || 330,
            height: Math.max(calculatedHeight, 152),
        };

        const updatedPorts = generatePortsForDecisionTableNode(
            currentNode.id,
            conditionGroups,
            !!decisionTableData.default_next_node,
            !!decisionTableData.error_next_node
        );

        this.createConnectionsForGroups(
            currentNode.id, 
            conditionGroups, 
            decisionTableData.default_next_node,
            decisionTableData.error_next_node
        );

        return {
            ...currentNode,
            node_name: this.form.value.node_name,
            size: updatedSize,
            ports: updatedPorts,
            data: {
                name: this.form.value.node_name || 'Decision Table',
                table: decisionTableData,
            },
        };
    }

    private createConnectionsForGroups(
        tableNodeId: string,
        groups: ConditionGroup[],
        defaultNextNode: string | null,
        errorNextNode: string | null
    ): void {
        const allNodes = this.flowService.nodes();
        const existingConnections = this.flowService.connections();

        const validGroupsWithNextNode = groups.filter(
            (g) => g.valid && g.next_node
        );

        validGroupsWithNextNode.forEach((group) => {
            this.createConnectionForNode(
                tableNodeId,
                group.next_node!,
                `decision-out-${group.group_name}`,
                allNodes,
                existingConnections
            );
        });

        if (defaultNextNode) {
            this.createConnectionForNode(
                tableNodeId,
                defaultNextNode,
                'decision-default',
                allNodes,
                existingConnections
            );
        }

        if (errorNextNode) {
            this.createConnectionForNode(
                tableNodeId,
                errorNextNode,
                'decision-error',
                allNodes,
                existingConnections
            );
        }
    }

    private createConnectionForNode(
        tableNodeId: string,
        targetNodeName: string,
        sourcePortRole: string,
        allNodes: any[],
        existingConnections: ConnectionModel[]
    ): void {
        const targetNode = allNodes.find(
            (n) => n.node_name === targetNodeName || n.id === targetNodeName
        );

        if (!targetNode) {
            console.warn(`Target node not found: ${targetNodeName}`);
            return;
        }

        const targetInputPort = targetNode.ports?.find(
            (p: any) => p.port_type === 'input'
        );

        if (!targetInputPort) {
            console.warn(`No input port found on target node: ${targetNode.node_name}`);
            return;
        }

        const normalizedRole = sourcePortRole.includes('decision-out-')
            ? sourcePortRole.replace('decision-out-', 'decision-out-').toLowerCase().replace(/\s+/g, '-')
            : sourcePortRole;
        
        const sourcePortId = `${tableNodeId}_${normalizedRole}` as CustomPortId;
        const targetPortId = targetInputPort.id;

        const connectionId = `${sourcePortId}+${targetPortId}`;
        const connectionExists = existingConnections.some(
            (c) => c.id === connectionId
        );

        if (!connectionExists) {
            const newConnection: ConnectionModel = {
                id: connectionId,
                category: 'default',
                sourceNodeId: tableNodeId,
                targetNodeId: targetNode.id,
                sourcePortId,
                targetPortId,
                behavior: 'fixed',
                type: 'segment',
            };

            this.flowService.addConnection(newConnection);
            console.log(`Created connection: ${sourcePortRole} → ${targetNode.node_name}`);
        }
    }

    public onConditionGroupsChange(groups: ConditionGroup[]): void {
        this.conditionGroups.set(groups);
        this.cdr.markForCheck();
    }
}
