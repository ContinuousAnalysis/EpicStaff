import { NodeType } from '../enums/node-type';


export const EXPANDABLE_NODE_TYPES: Set<NodeType> = new Set([
    NodeType.PYTHON,
    NodeType.WEBHOOK_TRIGGER,
    NodeType.EDGE,
]);

export function isNodeTypeExpandable(nodeType: string): boolean {
    return EXPANDABLE_NODE_TYPES.has(nodeType as NodeType);
}

