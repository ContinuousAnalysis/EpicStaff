export interface GetDefaultModelsResponse {
    id: number | null;
    agent_llm_config: number | null;
    agent_fcm_llm_config: number | null;
    voice_llm_config: number | null;
    transcription_llm_config: number | null;
    project_manager_llm_config: number | null;
    memory_embedding_config: number | null;
    memory_llm_config: number | null;
}

export interface UpdateDefaultModelsRequest {
    agent_llm_config?: number | null;
    agent_fcm_llm_config?: number | null;
    voice_llm_config?: number | null;
    transcription_llm_config?: number | null;
    project_manager_llm_config?: number | null;
    memory_embedding_config?: number | null;
    memory_llm_config?: number | null;
}
