export enum WebhookStatus {
    SUCCESS = 'success',
    FAIL = 'fail',
}

export interface GetTunnelResponse {
    status: WebhookStatus;
    tunnel_url?: string | null;
}

export interface RegisterTelegramTriggerRequest {
    telegram_trigger_node_id: number;
}

export interface RegisterTelegramTriggerResponse {

}
