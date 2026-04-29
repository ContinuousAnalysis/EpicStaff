import { NodeType } from '../../../core/enums/node-type';
import { ConnectionModel } from '../../../core/models/connection.model';
import { ClassificationDecisionTableNodeModel, NodeModel } from '../../../core/models/node.model';
import { CustomPortId } from '../../../core/models/port.model';
import { createFlowConnection } from '../../connection.factory';
import { getInputPortRole } from '../../node-port-roles';

export function mapClassificationDecisionTableToConnections(
    cdtNodes: ClassificationDecisionTableNodeModel[],
    nodeByUuid: Map<string, NodeModel>
): ConnectionModel[] {
    const connections: ConnectionModel[] = [];

    for (const cdtNode of cdtNodes) {
        const table = cdtNode.data.table;

        if (table.default_next_node) {
            const targetNode = nodeByUuid.get(table.default_next_node);
            if (targetNode && targetNode.type !== NodeType.EDGE) {
                connections.push(
                    createFlowConnection(
                        cdtNode.id,
                        targetNode.id,
                        `${cdtNode.id}_decision-default` as CustomPortId,
                        `${targetNode.id}_${getInputPortRole(targetNode.type)}` as CustomPortId
                    )
                );
            }
        }

        if (table.next_error_node) {
            const targetNode = nodeByUuid.get(table.next_error_node);
            if (targetNode && targetNode.type !== NodeType.EDGE) {
                connections.push(
                    createFlowConnection(
                        cdtNode.id,
                        targetNode.id,
                        `${cdtNode.id}_decision-error` as CustomPortId,
                        `${targetNode.id}_${getInputPortRole(targetNode.type)}` as CustomPortId
                    )
                );
            }
        }

        // Per-group route connections: restored from next_node resolved in ref-resolvers
        for (const group of table.condition_groups ?? []) {
            if (!group.next_node) continue;
            const targetNode = nodeByUuid.get(group.next_node);
            if (!targetNode || targetNode.type === NodeType.EDGE) continue;

            // Port ID follows decision-route-${slug(route_code)}, with fallback to decision-out-${group_name}.
            // Slug transform must match generatePortsForClassificationDecisionTableNode in helpers.ts
            // (lowercase + whitespace -> '-') otherwise the connection won't visually attach to its port.
            const slug = (s: string): string => s.toLowerCase().replace(/\s+/g, '-');
            const portRole = group.route_code
                ? `decision-route-${slug(group.route_code)}`
                : `decision-out-${group.group_name}`;

            connections.push(
                createFlowConnection(
                    cdtNode.id,
                    targetNode.id,
                    `${cdtNode.id}_${portRole}` as CustomPortId,
                    `${targetNode.id}_${getInputPortRole(targetNode.type)}` as CustomPortId
                )
            );
        }
    }

    return connections;
}
