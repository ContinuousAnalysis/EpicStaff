import { NodeType } from '../enums/node-type';
import { NodeModel } from './node.model';

export interface CreateNodeRequest {
    type: NodeType;
    overrides?: Partial<NodeModel>;
}
