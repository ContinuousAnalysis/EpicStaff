export interface TelegramTriggerField {
    field_name: string;
    field_type: string;
    description: string;
}

export interface GetTelegramTriggerFieldsResponse {
    data: {
        message: TelegramTriggerField[],
        callback_query: TelegramTriggerField[]
    }
}

export interface CreateTelegramTriggerNodeField {
    parent: string;
    field_name: string;
    variable_path: string;
}

export interface CreateTelegramTriggerNodeRequest {
    node_name: string;
    graph: number;
    telegram_bot_api_key: string;
    fields: CreateTelegramTriggerNodeField[];
}

export interface TelegramTriggerNodeField {
    id: number;
    parent: string;
    field_name: string;
    variable_path: string;
}

export interface GetTelegramTriggerNodeRequest {
    id: number;
    node_name: string;
    graph: number;
    telegram_bot_api_key: string;
    fields: TelegramTriggerNodeField[]
}
