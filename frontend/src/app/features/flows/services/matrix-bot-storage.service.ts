import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { MatrixBotApiService } from './matrix-bot-api.service';
import {
    MatrixBotDto,
    CreateMatrixBotRequest,
    UpdateMatrixBotRequest,
} from '../models/matrix-bot.model';

@Injectable({
    providedIn: 'root',
})
export class MatrixBotStorageService {
    private readonly api = inject(MatrixBotApiService);
    private readonly _cache = signal<Map<number, MatrixBotDto | null>>(new Map());

    getBotForFlow(flowId: number): Observable<MatrixBotDto | null> {
        return this.api.getByFlowId(flowId).pipe(
            tap((bot) => {
                const cache = new Map(this._cache());
                cache.set(flowId, bot);
                this._cache.set(cache);
            })
        );
    }

    createBot(request: CreateMatrixBotRequest): Observable<MatrixBotDto> {
        return this.api.create(request).pipe(
            tap((bot) => {
                const cache = new Map(this._cache());
                cache.set(bot.flow, bot);
                this._cache.set(cache);
            })
        );
    }

    updateBot(
        id: number,
        flowId: number,
        request: UpdateMatrixBotRequest
    ): Observable<MatrixBotDto> {
        return this.api.update(id, request).pipe(
            tap((bot) => {
                const cache = new Map(this._cache());
                cache.set(flowId, bot);
                this._cache.set(cache);
            })
        );
    }

    deleteBot(id: number, flowId: number): Observable<void> {
        return this.api.delete(id).pipe(
            tap(() => {
                const cache = new Map(this._cache());
                cache.set(flowId, null);
                this._cache.set(cache);
            })
        );
    }
}
