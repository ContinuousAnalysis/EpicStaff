import { Injectable } from '@angular/core';
import { FlowService } from './flow.service';

import { NodeModel } from '../core/models/node.model';
import { ConnectionModel } from '../core/models/connection.model';
import { GroupNodeModel } from '../core/models/group.model';

import { v4 as uuidv4 } from 'uuid';
import { FSelectionChangeEvent } from '@foblex/flow';
import { CustomPortId, ViewPort } from '../core/models/port.model';
import {
    parsePortId,
    getPortsForType,
    generatePortsForNode,
} from '../core/helpers/helpers';
import { NodeType } from '../core/enums/node-type';
import {
    generateNodeDisplayName,
    generateMultipleNodeDisplayNames,
} from '../core/helpers/generate-node-display-name.util';

interface ClipboardData {
    nodes: NodeModel[];
    connections: ConnectionModel[];
    groups: GroupNodeModel[];
    boundingBox: { minX: number; minY: number };
}

@Injectable({
    providedIn: 'root',
})
export class ClipboardService {
    private clipboard: ClipboardData | null = null;

    constructor(private flowService: FlowService) {}

    public setClipboardData(data: ClipboardData): void {
        this.clipboard = data;
    }

    public getClipboardData(): ClipboardData | null {
        return this.clipboard;
    }

    public copy(selection: FSelectionChangeEvent): void {
        if (
            !selection ||
            (selection.fNodeIds.length === 0 &&
                selection.fGroupIds.length === 0)
        ) {
            return;
        }

        const allNodes: NodeModel[] = this.flowService.getFlowState().nodes;
        const allGroups: GroupNodeModel[] =
            this.flowService.getFlowState().groups;

        const selectedNodes: NodeModel[] = allNodes.filter(
            (node) =>
                selection.fNodeIds.includes(node.id) &&
                node.type !== NodeType.START
        );

        // Get selected groups and their descendants
        const selectedGroups: GroupNodeModel[] = [];
        const processedGroupIds = new Set<string>();

        const collectGroupAndDescendants = (groupId: string) => {
            if (processedGroupIds.has(groupId)) return;

            const group = allGroups.find((g) => g.id === groupId);
            if (!group) return;

            processedGroupIds.add(groupId);
            selectedGroups.push(group);

            allGroups.forEach((g) => {
                if (g.parentId === groupId) {
                    collectGroupAndDescendants(g.id);
                }
            });

            selectedNodes.push(
                ...allNodes.filter(
                    (node) =>
                        node.parentId === groupId &&
                        node.type !== NodeType.START
                )
            );
        };

        selection.fGroupIds.forEach((groupId) => {
            collectGroupAndDescendants(groupId);
        });

        if (selectedNodes.length === 0 && selectedGroups.length === 0) {
            return;
        }

        const allElements = [...selectedNodes, ...selectedGroups];
        const minX: number = Math.min(
            ...allElements.map((el) => el.position.x)
        );
        const minY: number = Math.min(
            ...allElements.map((el) => el.position.y)
        );

        const selectedNodeIdSet = new Set<string>(
            selectedNodes.map((n) => n.id)
        );
        const selectedGroupIdSet = new Set<string>(
            selectedGroups.map((g) => g.id)
        );

        const allConnections: ConnectionModel[] =
            this.flowService.getFlowState().connections;
        const selectedConnections: ConnectionModel[] = allConnections.filter(
            (conn) => {
                const sourceParsed = parsePortId(conn.sourcePortId);
                const targetParsed = parsePortId(conn.targetPortId);
                if (!sourceParsed || !targetParsed) return false;

                const sourceInSelection =
                    selectedNodeIdSet.has(sourceParsed.nodeId) ||
                    selectedGroupIdSet.has(conn.sourceNodeId);
                const targetInSelection =
                    selectedNodeIdSet.has(targetParsed.nodeId) ||
                    selectedGroupIdSet.has(conn.targetNodeId);

                return sourceInSelection && targetInSelection;
            }
        );

        this.clipboard = {
            nodes: selectedNodes.map((node) => ({
                ...node,
                data: node.data
                    ? JSON.parse(JSON.stringify(node.data))
                    : node.data,
                ports: node.ports ? [...node.ports] : node.ports,
                position: { ...node.position },
            })),
            groups: selectedGroups.map((group) => ({
                ...group,
                position: { ...group.position },
            })),
            connections: selectedConnections.map((conn) => ({ ...conn })),
            boundingBox: { minX, minY },
        };
    }

    public paste(mousePosition: { x: number; y: number }): {
        newNodes: NodeModel[];
        newGroups: GroupNodeModel[];
        newConnections: ConnectionModel[];
    } {
        if (!this.clipboard) {
            return { newNodes: [], newGroups: [], newConnections: [] };
        }

        const {
            nodes: clipboardNodes,
            groups: clipboardGroups,
            connections: clipboardConnections,
            boundingBox,
        } = this.clipboard;

        if (clipboardNodes.length === 0 && clipboardGroups.length === 0) {
            return { newNodes: [], newGroups: [], newConnections: [] };
        }

        const offsetX = mousePosition.x - boundingBox.minX;
        const offsetY = mousePosition.y - boundingBox.minY;

        const oldToNewIdMap = new Map<string, string>();

        // Create new groups first
        const newGroups: GroupNodeModel[] = clipboardGroups.map((oldGroup) => {
            const newGroupId = uuidv4();
            oldToNewIdMap.set(oldGroup.id, newGroupId);

            return {
                ...oldGroup,
                id: newGroupId,
                position: {
                    x: oldGroup.position.x + offsetX,
                    y: oldGroup.position.y + offsetY,
                },
                parentId:
                    (oldGroup.parentId &&
                        oldToNewIdMap.get(oldGroup.parentId)) ||
                    null,
            };
        });

        // Generate display names for all nodes at once
        const currentNodes = this.flowService.getFlowState().nodes;
        const nodesToCreate = clipboardNodes.map((oldNode) => ({
            type: oldNode.type,
            data: oldNode.data,
        }));

        const displayNames = generateMultipleNodeDisplayNames(
            nodesToCreate,
            currentNodes
        );

        // Create new nodes with RC's backendId: null for diff-save support
        const newNodes: NodeModel[] = clipboardNodes.map((oldNode, index) => {
            const newNodeId = uuidv4();
            oldToNewIdMap.set(oldNode.id, newNodeId);

            const newPorts: ViewPort[] = generatePortsForNode(
                newNodeId,
                oldNode.type
            );

            return {
                ...oldNode,
                id: newNodeId,
                backendId: null,
                position: {
                    x: oldNode.position.x + offsetX,
                    y: oldNode.position.y + offsetY,
                },
                ports: newPorts,
                parentId:
                    (oldNode.parentId && oldToNewIdMap.get(oldNode.parentId)) ||
                    null,
                node_name: displayNames[index],
            };
        });

        const newConnections = clipboardConnections
            .map((oldConn) => {
                const newSourceNodeId = oldToNewIdMap.get(oldConn.sourceNodeId);
                const newTargetNodeId = oldToNewIdMap.get(oldConn.targetNodeId);

                if (!newSourceNodeId || !newTargetNodeId) {
                    return null;
                }

                const sourcePortParts = oldConn.sourcePortId.split('_');
                const targetPortParts = oldConn.targetPortId.split('_');

                if (sourcePortParts.length < 2 || targetPortParts.length < 2) {
                    return null;
                }

                const newSourcePortId = `${newSourceNodeId}_${sourcePortParts[1]}`;
                const newTargetPortId = `${newTargetNodeId}_${targetPortParts[1]}`;
                const newConnectionId = `${newSourcePortId}+${newTargetPortId}`;

                return {
                    id: newConnectionId,
                    sourceNodeId: newSourceNodeId,
                    targetNodeId: newTargetNodeId,
                    sourcePortId: newSourcePortId as CustomPortId,
                    targetPortId: newTargetPortId as CustomPortId,
                };
            })
            .filter((conn) => conn !== null) as ConnectionModel[];

        const currentFlow = this.flowService.getFlowState();

        this.flowService.setFlow({
            ...currentFlow,
            nodes: [...currentFlow.nodes, ...newNodes],
            groups: [...currentFlow.groups, ...newGroups],
            connections: [...currentFlow.connections, ...newConnections],
        });

        return { newNodes, newGroups, newConnections };
    }
}
