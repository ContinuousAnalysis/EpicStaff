import { NodeType } from '../../core/enums/node-type';
import { FlowModel } from '../../core/models/flow.model';

export function hasStartNode(flowModel: FlowModel): boolean {
    return flowModel.nodes.some((n) => n.type === NodeType.START);
}
