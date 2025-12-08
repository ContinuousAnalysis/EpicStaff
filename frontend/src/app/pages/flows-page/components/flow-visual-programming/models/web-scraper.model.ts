export interface GetWebScraperNodeRequest {
    id: number;
    node_name: string;
    graph: number;
    collection_name: string;
    time_to_expired: number;
    embedder: number;
    input_map: Record<string, any>;
    output_variable_path: string | null;
}

export interface CreateWebScraperNodeRequest {
    node_name: string;
    graph: number;
    collection_name: string;
    time_to_expired: number;
    embedder: number;
    input_map: Record<string, any>;
    output_variable_path: string | null;
}

