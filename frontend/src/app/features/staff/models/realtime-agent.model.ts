export interface RealtimeAgent {
    agent: number;
    similarity_threshold: string;
    search_limit: number;
    wake_word: string | null;
    stop_prompt: string | null;
    voice: string;
    openai_config: number | null;
    elevenlabs_config: number | null;
    gemini_config: number | null;
}

export interface UpdateRealtimeAgentRequest {
    agent: number;
    similarity_threshold?: string;
    search_limit?: number;
    wake_word?: string;
    stop_prompt?: string;
    voice?: string;
    openai_config?: number | null;
    elevenlabs_config?: number | null;
    gemini_config?: number | null;
}
export interface CreateRealtimeAgentRequest {
    agent: number;
    similarity_threshold?: string;
    search_limit?: number;
    wake_word?: string;
    stop_prompt?: string;
    voice?: string;
    openai_config?: number | null;
    elevenlabs_config?: number | null;
    gemini_config?: number | null;
}
