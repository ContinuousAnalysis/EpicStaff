export enum TunnelConfigType {
    LOCALHOST= 'localhost',
    NGROK = 'ngrok',
}

export interface BaseTunnelConfig {
    name: string;
    type: TunnelConfigType.NGROK | TunnelConfigType.LOCALHOST;
}

export interface LocalhostTunnelConfig {
    full_url: string;
    protocol: string;
    timeout: number;
    port_settings: number;
    enable_cors: boolean;
    permitted_origins: string[];
}

export interface NgrokTunnelConfig {
    authToken: string;
    region: string;
    public_url: string;
    local_port: string;
    web_inspection_interface: boolean;
    own_domain: boolean;
    subdomain: string;
    local_tcp_port: string;
    http_basic_auth: boolean;
    username: string;
    password: string;
    ip_whitelist: string[];
    request_reply: boolean;
    logging_all_requests: boolean;
    webhook_verification_token: string;
    custom_response_headers: string;
    webhook_response_body: string;
    request_transformation_rules: string;
}

export type TunnelConfig = LocalhostTunnelConfig | NgrokTunnelConfig;
