import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../../../services/config/config.service';
import {
    CreateScheduleTriggerNodeRequest,
    GetScheduleTriggerNodeRequest,
    PatchScheduleTriggerNodeRequest,
} from '../models/schedule-trigger.model';

@Injectable({
    providedIn: 'root',
})
export class ScheduleTriggerNodeService {
    private headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'schedule-trigger-nodes/';
    }

    createScheduleTriggerNode(request: CreateScheduleTriggerNodeRequest): Observable<GetScheduleTriggerNodeRequest> {
        return this.http.post<GetScheduleTriggerNodeRequest>(this.apiUrl, request, {
            headers: this.headers,
        });
    }

    updateScheduleTriggerNode(
        id: number,
        request: CreateScheduleTriggerNodeRequest
    ): Observable<GetScheduleTriggerNodeRequest> {
        return this.http.put<GetScheduleTriggerNodeRequest>(`${this.apiUrl}${id}/`, request, { headers: this.headers });
    }

    patchScheduleTriggerNode(
        id: number,
        request: PatchScheduleTriggerNodeRequest
    ): Observable<GetScheduleTriggerNodeRequest> {
        return this.http.patch<GetScheduleTriggerNodeRequest>(`${this.apiUrl}${id}/`, request, {
            headers: this.headers,
        });
    }

    deleteScheduleTriggerNode(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}${id}/`, {
            headers: this.headers,
        });
    }
}
