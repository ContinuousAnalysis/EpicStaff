import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap, throwError } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

import {
    CreateElevenLabsRealtimeConfigRequest,
    ElevenLabsRealtimeConfig,
    UpdateElevenLabsRealtimeConfigRequest,
} from '../../../../shared/models/realtime-voice/elevenlabs-realtime-config.model';
import { ElevenLabsRealtimeConfigService } from '../../../../shared/services/realtime-llms/elevenlabs-realtime-config.service';

@Injectable({ providedIn: 'root' })
export class ElevenLabsRealtimeConfigStorageService {
    private readonly api = inject(ElevenLabsRealtimeConfigService);

    private configsRequest$?: Observable<ElevenLabsRealtimeConfig[]>;
    private configsSignal = signal<ElevenLabsRealtimeConfig[]>([]);
    private configsLoaded = signal<boolean>(false);

    public readonly configs = this.configsSignal.asReadonly();
    public readonly isConfigsLoaded = this.configsLoaded.asReadonly();

    getAllConfigs(forceRefresh = false): Observable<ElevenLabsRealtimeConfig[]> {
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

    createConfig(data: CreateElevenLabsRealtimeConfigRequest): Observable<ElevenLabsRealtimeConfig> {
        return this.api.create(data).pipe(
            tap((config) => this.configsSignal.update((configs) => [config, ...configs])),
            catchError((err) => throwError(() => err))
        );
    }

    updateConfig(data: UpdateElevenLabsRealtimeConfigRequest): Observable<ElevenLabsRealtimeConfig> {
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
