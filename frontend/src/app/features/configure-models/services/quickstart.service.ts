import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../services/config';
import { GetDefaultModelsResponse } from '../models/default-models.model';
import { CreateQuickstartRequest, CreateQuickstartResponse, GetQuickstartResponse } from '../models/quickstart.model';

@Injectable({
    providedIn: 'root',
})
export class QuickstartService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);

    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return this.configService.apiUrl + 'quickstart/';
    }

    createQuickstart(data: CreateQuickstartRequest): Observable<CreateQuickstartResponse> {
        return this.http.post<CreateQuickstartResponse>(this.apiUrl, data, {
            headers: this.headers,
        });
    }

    getQuickstart(): Observable<GetQuickstartResponse> {
        return this.http.get<GetQuickstartResponse>(this.apiUrl, {
            headers: this.headers,
        });
    }

    applyQuickstart(): Observable<GetDefaultModelsResponse> {
        return this.http.post<GetDefaultModelsResponse>(`${this.apiUrl}apply/`, {});
    }
}
