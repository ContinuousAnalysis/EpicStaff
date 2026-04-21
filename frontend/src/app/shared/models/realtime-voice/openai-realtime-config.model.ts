export interface OpenAIRealtimeConfig {
    id: number;
    custom_name: string;
    api_key: string | null;
    model_name: string;
    transcription_model_name: string | null;
    transcription_api_key: string | null;
    voice_recognition_prompt: string | null;
}

export interface CreateOpenAIRealtimeConfigRequest {
    custom_name: string;
    api_key?: string | null;
    model_name?: string;
    transcription_model_name?: string | null;
    transcription_api_key?: string | null;
    voice_recognition_prompt?: string | null;
}

export interface UpdateOpenAIRealtimeConfigRequest extends CreateOpenAIRealtimeConfigRequest {
    id: number;
}
