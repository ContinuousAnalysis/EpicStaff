export interface VoiceSettings {
    twilio_account_sid: string;
    twilio_auth_token: string;
    voice_agent: number | null;
    ngrok_config: number | null;
    voice_stream_url: string | null;
}
