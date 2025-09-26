import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from '../../services/config/config.service';
import { FlowModel } from '../../visual-programming/core/models/flow.model';

@Injectable({
    providedIn: 'root',
})
export class ImportExportService {
    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'graphs/';
    }

    importFlow(file: File): Observable<any> {
        const formData = new FormData();
        formData.append('file', file);

        return this.http.post<any>(`${this.apiUrl}import/`, formData);
    }

    exportFlow(graphId: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}${graphId}/export/`, {
            responseType: 'blob',
        });
    }
}
