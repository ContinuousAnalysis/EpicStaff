export const EP_CHAT_ACTIONS = {
    AGENT_CREATE: 'agent.create',
    AGENT_UPDATE: 'agent.update',
    AGENT_DELETE: 'agent.delete',
    AGENT_SELECT: 'agent.select',
} as const;

export type EpChatAction = (typeof EP_CHAT_ACTIONS)[keyof typeof EP_CHAT_ACTIONS];

export interface EpicChatCreateAgentPayload {
    name: string;
    description?: string;
    flowId: number | string;
    flowUrl: string;
    imagePath?: string;
    selectAfterCreate?: boolean;
}

export type EpChatCommandPayload =
    | EpicChatCreateAgentPayload
    | Record<string, unknown>;

export interface EpChatCommand {
    requestId: string;
    action: EpChatAction | string;
    payload: EpChatCommandPayload;
}

export interface EpChatCommandResult {
    requestId: string;
    action: EpChatAction | string;
    success: boolean;
    message?: string;
    payload?: Record<string, unknown>;
}

export interface EpChatEvent {
    type: string;
    payload?: Record<string, unknown>;
}
