import { FlowModel } from '../../core/models/flow.model';

export function cloneFlowState(flow: FlowModel): FlowModel {
    if (typeof structuredClone === 'function') {
        return structuredClone(flow);
    }
    return JSON.parse(JSON.stringify(flow)) as FlowModel;
}
