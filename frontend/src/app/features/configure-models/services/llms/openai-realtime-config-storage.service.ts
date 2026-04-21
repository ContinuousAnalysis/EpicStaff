import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap, throwError } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

import {
    CreateOpenAIRealtimeConfigRequest,
    OpenAIRealtimeConfig,
    UpdateOpenAIRealtimeConfigRequest,
} from '../../../../shared/models/realtime-voice/openai-realtime-config.model';
import { OpenAIRealtimeConfigService } from '../../../../shared/services/realtime-llms/openai-realtime-config.service';

@Injectable({ providedIn: 'root' })
export class OpenAIRealtimeConfigStorageService {
    private readonly api = inject(OpenAIRealtimeConfigService);

    private configsRequest$?: Observable<OpenAIRealtimeConfig[]>;
    private configsSignal = signal<OpenAIRealtimeConfig[]>([]);
    private configsLoaded = signal<boolean>(false);

    public readonly configs = this.configsSignal.asReadonly();
    public readonly isConfigsLoaded = this.configsLoaded.asReadonly();

    getAllConfigs(forceRefresh = false): Observable<OpenAIRealtimeConfig[]> {
        if (this.configsLoaded() && !forceRefresh) return of(this.configsSignal());
        if (this.configsRequest$ && !forceRefresh) return this.configsRequest$;

        this.configsRequest$ = this.api.getAll().pipe(
            tap((configs) => {
                this.configsSignal.set(configs);
                this.configsLoaded.set(true);
            }),
            finalize(() => {
                this.configsRequest$ = undefined;
            }),
            shareReplay(1)
        );
        return this.configsRequest$;
    }

    createConfig(data: CreateOpenAIRealtimeConfigRequest): Observable<OpenAIRealtimeConfig> {
        return this.api.create(data).pipe(
            tap((config) => this.configsSignal.update((configs) => [config, ...configs])),
            catchError((err) => throwError(() => err))
        );
    }

    updateConfig(data: UpdateOpenAIRealtimeConfigRequest): Observable<OpenAIRealtimeConfig> {
        return this.api.update(data).pipe(
            tap((updated) =>
                this.configsSignal.update((configs) => {
                    const i = configs.findIndex((c) => c.id === updated.id);
                    if (i >= 0) {
                        const copy = [...configs];
                        copy[i] = updated;
                        return copy;
                    }
                    return [updated, ...configs];
                })
            ),
            catchError((err) => throwError(() => err))
        );
    }

    deleteConfig(id: number): Observable<void> {
        return this.api.delete(id).pipe(
            tap(() => this.configsSignal.update((configs) => configs.filter((c) => c.id !== id))),
            catchError((err) => throwError(() => err))
        );
    }

    markConfigsOutdated(): void {
        this.configsLoaded.set(false);
    }
}
