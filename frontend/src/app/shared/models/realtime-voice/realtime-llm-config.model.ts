export interface RealtimeModelConfig {
    id: number;
    custom_name: string;
    api_key: string;
    realtime_model: number;
    provider_name?: string;
}

export interface CreateRealtimeModelConfigRequest {
    api_key: string;
    realtime_model: number;
    custom_name: string;
}

export interface UpdateRealtimeModelConfigRequest {
    id: number;
    custom_name: string;
    api_key?: string;
    realtime_model: number;
}
