export interface TwilioChannel {
    channel: number;
    account_sid: string;
    auth_token: string;
    phone_number: string | null;
    ngrok_config: number | null;
}

export interface RealtimeChannel {
    id: number;
    name: string;
    channel_type: 'twilio';
    token: string;
    realtime_agent: number | null;
    is_active: boolean;
    twilio?: TwilioChannel;
}

export interface CreateRealtimeChannelRequest {
    name: string;
    channel_type: 'twilio';
    realtime_agent?: number | null;
    is_active?: boolean;
}

export interface UpdateRealtimeChannelRequest {
    id: number;
    name?: string;
    realtime_agent?: number | null;
    is_active?: boolean;
}

export interface CreateTwilioChannelRequest {
    channel: number;
    account_sid: string;
    auth_token: string;
    phone_number?: string | null;
    ngrok_config?: number | null;
}

export interface UpdateTwilioChannelRequest {
    channel: number;
    account_sid?: string;
    auth_token?: string;
    phone_number?: string | null;
    ngrok_config?: number | null;
}
