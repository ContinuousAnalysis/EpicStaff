import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../services/config';
import { VoiceSettings } from '../models/voice-settings.model';

export interface TwilioPhoneNumber {
    sid: string;
    phone_number: string;
    friendly_name: string;
    voice_url: string;
}

@Injectable({
    providedIn: 'root',
})
export class VoiceSettingsService {
    private configService = inject(ConfigService);
    private http = inject(HttpClient);

    private get apiUrl(): string {
        return this.configService.apiUrl + 'voice-settings/';
    }

    private get twilioApiUrl(): string {
        return this.configService.apiUrl + 'twilio/';
    }

    get(): Observable<VoiceSettings> {
        return this.http.get<VoiceSettings>(this.apiUrl);
    }

    update(data: Partial<VoiceSettings>): Observable<VoiceSettings> {
        return this.http.patch<VoiceSettings>(this.apiUrl, data);
    }

    getPhoneNumbers(): Observable<TwilioPhoneNumber[]> {
        return this.http.get<TwilioPhoneNumber[]>(`${this.twilioApiUrl}phone-numbers/`);
    }

    configureWebhook(phoneSid: string): Observable<{ webhook_url: string }> {
        return this.http.post<{ webhook_url: string }>(`${this.twilioApiUrl}configure-webhook/`, {
            phone_sid: phoneSid,
        });
    }
}
