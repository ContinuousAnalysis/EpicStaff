export interface GetScheduleTriggerNodeRequest {
    id: number;
    node_name: string;
    graph: number;
    metadata: Record<string, any>;
}

export interface CreateScheduleTriggerNodeRequest {
    node_name: string;
    graph: number;
    metadata?: Record<string, any>;
}
