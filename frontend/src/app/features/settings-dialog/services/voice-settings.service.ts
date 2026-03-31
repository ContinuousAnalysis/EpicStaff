import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config';
import { VoiceSettings } from '../models/voice-settings.model';

@Injectable({
    providedIn: 'root',
})
export class VoiceSettingsService {
    private configService = inject(ConfigService);
    private http = inject(HttpClient);

    private get apiUrl(): string {
        return this.configService.apiUrl + 'voice-settings/';
    }

    get(): Observable<VoiceSettings> {
        return this.http.get<VoiceSettings>(this.apiUrl);
    }

    update(data: Partial<VoiceSettings>): Observable<VoiceSettings> {
        return this.http.patch<VoiceSettings>(this.apiUrl, data);
    }
}
