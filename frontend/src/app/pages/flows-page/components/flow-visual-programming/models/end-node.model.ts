export interface EndNode {
    id: number;
    graph: number;
    output_map: Record<string, any>;
}

export interface UpdateEndNodeRequest {
    output_map: Record<string, any>;
}

export interface CreateEndNodeRequest {
    graph: number;
    output_map: Record<string, any>;
}
