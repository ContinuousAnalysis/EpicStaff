import { computed, inject, Injectable } from '@angular/core';
import { PROVIDER_ICON_PATHS } from '@shared/constants';
import { EmbeddingModel, LLMModel, LLMProvider, ModelTypes, RealtimeModel } from "@shared/models";
import { EmbeddingModelsService, RealtimeModelsService } from "@shared/services";
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GetRealtimeTranscriptionModelRequest } from "../../../transcription/models/transcription-config.model";
import { RealtimeTranscriptionModelsService } from "../../../transcription/services/transcription-models.service";
import { LlmLibraryModel } from '../../interfaces/llm-library-model.interface';
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';

import { LlmConfigStorageService } from './llm-config-storage.service';
import { LlmModelsStorageService } from './llm-models-storage.service';
import { LlmProvidersStorageService } from './llm-providers-storage.service';

export interface ProviderWithModels<T extends { id: number; name: string } = any> {
    provider: LLMProvider;
    models: T[];
    visibleModels: T[];
}

@Injectable({
    providedIn: 'root',
})
export class LLMLibraryService {
    private readonly configStorage = inject(LlmConfigStorageService);
    private readonly realtimeModelsService = inject(RealtimeModelsService);
    private readonly transcriptionModelsService = inject(RealtimeTranscriptionModelsService);
    private readonly embeddingModelsService = inject(EmbeddingModelsService);
    private readonly llmModelsStorage = inject(LlmModelsStorageService);
    private readonly providersStorage = inject(LlmProvidersStorageService);

    private providerIdExtractors: Record<ModelTypes, (model: any) => number> = {
        [ModelTypes.LLM]: (m) => m.llm_provider,
        [ModelTypes.TRANSCRIPTION]: (m) => m.provider,
        [ModelTypes.REALTIME]: (m) => m.provider,
        [ModelTypes.EMBEDDING]: (m) => m.embedding_provider,
    };

    private visibilityExtractors: Record<ModelTypes, (model: any) => boolean> = {
        [ModelTypes.LLM]: (m) => m.is_visible,
        [ModelTypes.EMBEDDING]: (m) => m.is_visible,
        [ModelTypes.REALTIME]: (_m) => true,
        [ModelTypes.TRANSCRIPTION]: (_m) => true,
    };

    public readonly providerGroups = computed<LlmLibraryProviderGroup[]>(() => {
        const configs = this.configStorage.configs();
        const models = this.llmModelsStorage.models();
        const providers = this.providersStorage.providersByType().get(ModelTypes.LLM) ?? [];

        const modelMap = new Map(models.map((m) => [m.id, m]));
        const providerMap = new Map(providers.map((p) => [p.id, p]));
        const groupsMap = new Map<number, LlmLibraryProviderGroup>();

        for (const config of configs) {
            const model = modelMap.get(config.model);
            if (!model) continue;

            const provider = providerMap.get(model.llm_provider);
            if (!provider) continue;

            if (!groupsMap.has(provider.id)) {
                const iconKey = provider.name.toLowerCase();
                groupsMap.set(provider.id, {
                    id: provider.id.toString(),
                    providerName: provider.name,
                    providerIconPath: PROVIDER_ICON_PATHS[iconKey] ?? PROVIDER_ICON_PATHS['default'],
                    models: [],
                });
            }

            const libraryModel: LlmLibraryModel = {
                id: config.id,
                customName: config.custom_name,
                modelName: model.name,
                tags: config.tags,
                temperature: config.temperature ?? 0,
                usedByCount: null,
            };

            groupsMap.get(provider.id)!.models.push(libraryModel);
        }

        return Array.from(groupsMap.values());
    });

    loadConfigs(): Observable<void> {
        return forkJoin({
            configs: this.configStorage.getAllConfigs(),
            models: this.llmModelsStorage.getModels(),
            providers: this.providersStorage.getProvidersByType(ModelTypes.LLM),
        }).pipe(map(() => void 0));
    }

    loadModels(type: ModelTypes): Observable<ProviderWithModels[]> {
        return forkJoin({
            models: this.getModelsByType(type),
            providers: this.providersStorage.getProvidersByType(type),
        }).pipe(
            map(({ models, providers }) => {
                const getProviderId = this.providerIdExtractors[type];
                const isVisible = this.visibilityExtractors[type];
                const modelsMap = this.groupModelsByProvider(models, getProviderId);
                return this.mapToProviderWithModels(providers, modelsMap, isVisible);
            })
        );
    }

    private getModelsByType(type: ModelTypes): Observable<
        LLMModel[] |
        GetRealtimeTranscriptionModelRequest[] |
        EmbeddingModel[] |
        RealtimeModel[]
    > {
        switch (type) {
            case ModelTypes.LLM:
                return this.llmModelsStorage.getModels();

            case ModelTypes.TRANSCRIPTION:
                return this.transcriptionModelsService
                    .getAllModels()
                    .pipe(map(res => res.results));

            case ModelTypes.REALTIME:
                return this.realtimeModelsService.getAllModels();

            case ModelTypes.EMBEDDING:
                return this.embeddingModelsService.getEmbeddingModels();

            default:
                return this.llmModelsStorage.getModels();
        }
    }

    private groupModelsByProvider<T>(
        models: T[],
        getProviderId: (model: T) => number
    ): Map<number, T[]> {
        const map = new Map<number, T[]>();

        for (const model of models) {
            const providerId = getProviderId(model);
            const list = map.get(providerId) ?? [];

            list.push(model);
            map.set(providerId, list);
        }

        return map;
    }

    private mapToProviderWithModels(
        providers: LLMProvider[],
        modelsMap: Map<number, any[]>,
        isVisible: (model: any) => boolean
    ): ProviderWithModels[] {
        return providers.map((provider) => {
            const allModels = modelsMap.get(provider.id) ?? [];
            const visibleModels = allModels.filter(isVisible);

            return {
                provider,
                models: allModels,
                visibleModels,
            };
        });
    }
}
