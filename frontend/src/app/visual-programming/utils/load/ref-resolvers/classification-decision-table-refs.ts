import { GetClassificationDecisionTableNodeRequest } from '../../../../pages/flows-page/components/flow-visual-programming/models/classification-decision-table-node.model';
import { ClassificationDecisionTableNodeModel } from '../../../core/models/node.model';

/**
 * After all nodes are built and the backendId → UUID map exists, fills in
 * UUID references inside each CDT node's table data:
 *   - default_next_node (stored as node name → resolve to UUID)
 *   - next_error_node (stored as node name → resolve to UUID)
 *
 * CDT condition groups do NOT carry per-row next_node; routing is via route_code → port matching.
 *
 * Mutates models in place — called once at load time before connections are built.
 */
export function resolveClassificationDecisionTableNodeRefs(
    cdtNodes: ClassificationDecisionTableNodeModel[],
    backendCdtNodes: GetClassificationDecisionTableNodeRequest[],
    _backendIdToUuid: Map<number, string>,
    nodeByName: Map<string, string>
): void {
    for (const cdtNode of cdtNodes) {
        const backendCdt = backendCdtNodes.find((d) => d.id === cdtNode.backendId);
        if (!backendCdt) continue;

        const table = cdtNode.data.table;

        // default_next_node and next_error_node come back as node names from the backend
        table.default_next_node = table.default_next_node ? (nodeByName.get(table.default_next_node) ?? null) : null;

        table.next_error_node = table.next_error_node ? (nodeByName.get(table.next_error_node) ?? null) : null;
    }
}
