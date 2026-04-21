export interface ElevenLabsRealtimeConfig {
    id: number;
    custom_name: string;
    api_key: string | null;
    model_name: string;
    language: string | null;
}

export interface CreateElevenLabsRealtimeConfigRequest {
    custom_name: string;
    api_key?: string | null;
    model_name?: string;
    language?: string | null;
}

export interface UpdateElevenLabsRealtimeConfigRequest extends CreateElevenLabsRealtimeConfigRequest {
    id: number;
}
