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
    }

    return connections;
}
