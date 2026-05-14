import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ConfigService } from '../../services/config/config.service';

export type ExportFormat = 'json' | 'csv';

@Injectable({
    providedIn: 'root',
})
export class ImportExportService {
    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'graphs/';
    }

    private get sessionsApiUrl(): string {
        return this.configService.apiUrl + 'sessions/';
    }

    importFlow(file: File, preserveUuids: boolean = false): Observable<Record<string, unknown>> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('preserve_uuids', String(preserveUuids));

        return this.http.post<Record<string, unknown>>(`${this.apiUrl}import/`, formData);
    }

    exportFlow(graphId: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}${graphId}/export/`, {
            responseType: 'blob',
        });
    }

    bulkExportFlow(ids: number[]): Observable<Blob> {
        return this.http.post(
            `${this.apiUrl}bulk-export/`,
            { ids },
            {
                responseType: 'blob',
            }
        );
    }

    exportSession(id: number, format: ExportFormat): Observable<Blob> {
        return this.http.get(`${this.sessionsApiUrl}${id}/export/?export_format=${format}`, {
            responseType: 'blob',
        });
    }

    bulkExportSessions(ids: number[], format: ExportFormat): Observable<Blob> {
        return this.http.post(
            `${this.sessionsApiUrl}bulk-export/?export_format=${format}`,
            { ids },
            {
                responseType: 'blob',
            }
        );
    }

    exportAll(filters: { graph?: number | null; status?: string[] }, format: ExportFormat = 'json'): Observable<Blob> {
        const body: Record<string, unknown> = { export_format: format };
        if (filters.graph != null) body['graph'] = filters.graph;
        if (filters.status != null && filters.status.length > 0) body['status'] = filters.status;
        return this.http.post<Blob>(`${this.sessionsApiUrl}export_all/`, body, {
            responseType: 'blob' as 'json',
        });
    }
}
