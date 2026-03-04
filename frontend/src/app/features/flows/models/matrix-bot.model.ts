export interface MatrixBotDto {
    id: number;
    flow: number;
    matrix_user_id: string;
    input_variable: string;
    output_variable: string;
    enabled: boolean;
    created_at: string;
}

export interface CreateMatrixBotRequest {
    flow: number;
    input_variable?: string;
    output_variable?: string;
    enabled?: boolean;
}

export interface UpdateMatrixBotRequest {
    input_variable?: string;
    output_variable?: string;
    enabled?: boolean;
}
