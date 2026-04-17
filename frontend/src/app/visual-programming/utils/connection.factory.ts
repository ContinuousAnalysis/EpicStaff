import { ConnectionModel } from '../core/models/connection.model';
import { CustomPortId } from '../core/models/port.model';

export function createFlowConnection(
    sourceNodeId: string,
    targetNodeId: string,
    sourcePortId: CustomPortId,
    targetPortId: CustomPortId,
    startColor?: string,
    endColor?: string
): ConnectionModel {
    return {
        id: `${sourcePortId}+${targetPortId}`,
        category: 'default',
        sourceNodeId,
        targetNodeId,
        sourcePortId,
        targetPortId,
        startColor,
        endColor,
        behavior: 'fixed',
        type: 'segment',
        data: null,
    };
}
