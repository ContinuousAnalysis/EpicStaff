import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from '../../../services/config/config.service';
import {
    MatrixBotDto,
    CreateMatrixBotRequest,
    UpdateMatrixBotRequest,
} from '../models/matrix-bot.model';

@Injectable({
    providedIn: 'root',
})
export class MatrixBotApiService {
    private readonly http = inject(HttpClient);
    private readonly configService = inject(ConfigService);

    private get apiUrl(): string {
        return `${this.configService.apiUrl}matrix-bots/`;
    }

    getByFlowId(flowId: number): Observable<MatrixBotDto | null> {
        return this.http
            .get<{ results: MatrixBotDto[] }>(`${this.apiUrl}?flow=${flowId}`)
            .pipe(map((response) => response.results[0] ?? null));
    }

    create(request: CreateMatrixBotRequest): Observable<MatrixBotDto> {
        return this.http.post<MatrixBotDto>(this.apiUrl, request);
    }

    update(id: number, request: UpdateMatrixBotRequest): Observable<MatrixBotDto> {
        return this.http.patch<MatrixBotDto>(`${this.apiUrl}${id}/`, request);
    }

    delete(id: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}${id}/`);
    }
}
