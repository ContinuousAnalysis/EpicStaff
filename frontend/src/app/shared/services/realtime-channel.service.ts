import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ConfigService } from '../../services/config';
import {
    CreateRealtimeChannelRequest,
    CreateTwilioChannelRequest,
    RealtimeChannel,
    TwilioChannel,
    UpdateRealtimeChannelRequest,
    UpdateTwilioChannelRequest,
} from '../models/realtime-voice/realtime-channel.model';

interface ApiListResponse<T> {
    results: T[];
}

export interface TwilioPhoneNumber {
    sid: string;
    phone_number: string;
    friendly_name: string;
    voice_url: string | null;
}

@Injectable({ providedIn: 'root' })
export class RealtimeChannelService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);
    private headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    private get channelUrl(): string {
        return this.configService.apiUrl + 'realtime-channels/';
    }

    private get twilioChannelUrl(): string {
        return this.configService.apiUrl + 'twilio-channels/';
    }

    getChannels(): Observable<RealtimeChannel[]> {
        return this.http
            .get<ApiListResponse<RealtimeChannel>>(this.channelUrl, { headers: this.headers })
            .pipe(map((r) => r.results));
    }

    createChannel(data: CreateRealtimeChannelRequest): Observable<RealtimeChannel> {
        return this.http.post<RealtimeChannel>(this.channelUrl, data, { headers: this.headers });
    }

    updateChannel(data: UpdateRealtimeChannelRequest): Observable<RealtimeChannel> {
        return this.http.patch<RealtimeChannel>(`${this.channelUrl}${data.id}/`, data, { headers: this.headers });
    }

    deleteChannel(id: number): Observable<void> {
        return this.http.delete<void>(`${this.channelUrl}${id}/`, { headers: this.headers });
    }

    createTwilioChannel(data: CreateTwilioChannelRequest): Observable<TwilioChannel> {
        return this.http.post<TwilioChannel>(this.twilioChannelUrl, data, { headers: this.headers });
    }

    updateTwilioChannel(data: UpdateTwilioChannelRequest): Observable<TwilioChannel> {
        return this.http.patch<TwilioChannel>(`${this.twilioChannelUrl}${data.channel}/`, data, {
            headers: this.headers,
        });
    }

    getPhoneNumbers(accountSid: string, authToken: string): Observable<TwilioPhoneNumber[]> {
        return this.http
            .get<ApiListResponse<TwilioPhoneNumber>>(this.configService.apiUrl + 'twilio/phone-numbers/', {
                headers: new HttpHeaders({
                    'Content-Type': 'application/json',
                    'X-Twilio-Account-Sid': accountSid,
                    'X-Twilio-Auth-Token': authToken,
                }),
            })
            .pipe(map((r) => r.results));
    }

    configureWebhook(
        phoneSid: string,
        channelToken: string,
        accountSid: string,
        authToken: string
    ): Observable<{ webhook_url: string }> {
        return this.http.post<{ webhook_url: string }>(
            this.configService.apiUrl + 'twilio/configure-webhook/',
            { phone_sid: phoneSid, channel_token: channelToken },
            {
                headers: new HttpHeaders({
                    'Content-Type': 'application/json',
                    'X-Twilio-Account-Sid': accountSid,
                    'X-Twilio-Auth-Token': authToken,
                }),
            }
        );
    }
}
