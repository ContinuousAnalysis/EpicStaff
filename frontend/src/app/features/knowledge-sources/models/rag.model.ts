export enum RagTypeLevel {
    BASIC = 'Basic',
    ADVANCED = 'Advanced',
    EXPERT = 'Expert',
}

export enum RagName {
    NAIVE_RAG = 'Naive RAG',
    GRAPH_RAG = 'Graph RAG',
    HYBRID_RAG = 'Hybrid RAG',
}

export type RagValueMap = {
    [RagName.NAIVE_RAG]: 'naive';
    [RagName.GRAPH_RAG]: 'graph';
    [RagName.HYBRID_RAG]: 'hybrid';
}

export type Rag = {
    [K in RagName]: {
        name: K;
        value: RagValueMap[K];
        description: string;
        tip: string;
        icon: string;
        level: RagTypeLevel;
        stars: number;
        disabled?: boolean;
    }
}[RagName];

export type RagType = RagValueMap[keyof RagValueMap];

export interface BaseRagType {
    rag_type_id: number;
    rag_type: 'naive';
    source_collection: number;
}

export interface CollectionNaiveRag {
    chunks_count: number;
    document_configs_count: number;
    embedder_id: number;
    embedder_name: string;
    embeddings_count: number;
    is_ready_for_indexing: boolean;
    message: string | null;
    rag_id: number;
    rag_type: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface CreateNaiveRag {
    naive_rag_id: number;
    base_rag_type: BaseRagType;
    embedder: number;
    rag_status: 'new';
    collection_id: number;
    created_at: string;
    updated_at: string;
}

export interface CreateRagForCollectionResponse {
    message: string;
    naive_rag: CreateNaiveRag;
}

export interface NaiveRagDocumentConfig {
    naive_rag_document_id: number;
    document_id: number;
    file_name: string;
    chunk_strategy: string;
    chunk_size: number;
    chunk_overlap: number;
    additional_params: {};
    status: string;
    total_chunks: number;
    total_embeddings: number;
    created_at: string;
    processed_at: string | null;
}

export interface InitNaiveRagDocumentsResponse {
    message: string;
    configs_created: number;
    configs_existing: number;
    new_configs: any[];
}

export interface GetNaiveRagDocumentConfigsResponse {
    naive_rag_id: number;
    total_configs: number;
    configs: NaiveRagDocumentConfig[];
}

export interface UpdateNaiveRagDocumentDtoRequest {
    chunk_size?: number;
    chunk_overlap?: number;
    chunk_strategy?: string;
    additional_params?: {};
}

export interface BulkUpdateNaiveRagDocumentDtoRequest extends UpdateNaiveRagDocumentDtoRequest {
    config_ids: number[];
}

export interface UpdateNaiveRagDocumentConfigError {
    field: keyof NaiveRagDocumentConfig;
    value: string | number;
    reason: string;
}

interface UpdatedNaiveRagDocumentConfig extends NaiveRagDocumentConfig {
    errors: UpdateNaiveRagDocumentConfigError[];
}

export interface BulkUpdateNaiveRagDocumentDtoResponse {
    configs: UpdatedNaiveRagDocumentConfig[];
    failed_count: number;
    message: string;
    updated_count: number;
}

export interface BulkDeleteNaiveRagDocumentDtoRequest {
    config_ids: number[];
}

export interface BulkDeleteNaiveRagDocumentDtoResponse {
    deleted_config_ids: number[];
    deleted_count: number;
    message: string;
}

export interface UpdateNaiveRagDocumentResponse {
    message: string;
    config: NaiveRagDocumentConfig;
}

export interface StartIndexingDtoRequest {
    rag_id: number;
    rag_type: RagType;
}

export interface StartIndexingDtoResponse {
    detail: string;
    rag_id: number;
    rag_type: string;
    collection_id: number;
}
