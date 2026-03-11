import { inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, tap, throwError } from 'rxjs';
import {
    CreateLLMConfigRequest,
    GetLlmConfigRequest,
    UpdateLLMConfigRequest,
} from '../../models/llms/LLM_config.model';
import { LLM_Config_Service } from './llm-config.service';

@Injectable({
    providedIn: 'root',
})
export class LlmConfigStorageService {
    private readonly llmConfigService = inject(LLM_Config_Service);

    private configsSignal = signal<GetLlmConfigRequest[]>([]);
    private configsLoaded = signal<boolean>(false);

    public readonly configs = this.configsSignal.asReadonly();
    public readonly isConfigsLoaded = this.configsLoaded.asReadonly();

    getAllConfigs(forceRefresh = false): Observable<GetLlmConfigRequest[]> {
        if (this.configsLoaded() && !forceRefresh) {
            return of(this.configsSignal());
        }
        return this.llmConfigService.getAllConfigsLLM().pipe(
            tap((configs) => {
                this.configsSignal.set(configs);
                this.configsLoaded.set(true);
            }),
            catchError((err) => {
                this.configsLoaded.set(false);
                return throwError(() => err);
            })
        );
    }

    getConfigById(id: number): Observable<GetLlmConfigRequest> {
        const cached = this.configsSignal().find((c) => c.id === id);
        if (cached) {
            return of(cached);
        }
        return this.llmConfigService.getConfigById(id).pipe(
            tap((config) => this.mergeConfigsIntoCache([config])),
            catchError((err) => throwError(() => err))
        );
    }

    createConfig(data: CreateLLMConfigRequest): Observable<GetLlmConfigRequest> {
        return this.llmConfigService.createConfig(data).pipe(
            tap((config) => {
                this.configsSignal.update((configs) => [config, ...configs]);
            }),
            catchError((err) => throwError(() => err))
        );
    }

    updateConfig(data: UpdateLLMConfigRequest): Observable<GetLlmConfigRequest> {
        return this.llmConfigService.updateConfig(data).pipe(
            tap((updated) => this.updateConfigInCache(updated)),
            catchError((err) => throwError(() => err))
        );
    }

    deleteConfig(id: number): Observable<void> {
        return this.llmConfigService.deleteConfig(id).pipe(
            tap(() => {
                this.configsSignal.update((configs) => configs.filter((c) => c.id !== id));
            }),
            catchError((err) => throwError(() => err))
        );
    }

    private mergeConfigsIntoCache(incoming: GetLlmConfigRequest[]): void {
        this.configsSignal.update((current) => {
            const map = new Map(current.map((c) => [c.id, c]));
            for (const config of incoming) {
                map.set(config.id, config);
            }
            return Array.from(map.values());
        });
    }

    private updateConfigInCache(updated: GetLlmConfigRequest): void {
        this.configsSignal.update((configs) => {
            const index = configs.findIndex((c) => c.id === updated.id);
            if (index >= 0) {
                const copy = [...configs];
                copy[index] = updated;
                return copy;
            }
            return [updated, ...configs];
        });
    }
}
