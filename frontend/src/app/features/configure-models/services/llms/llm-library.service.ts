import { computed, inject, Injectable, signal } from '@angular/core';
import { PROVIDER_ICON_PATHS } from '@shared/constants';
import { EmbeddingModel, LLMProvider, ModelTypes, RealtimeModel, Tag } from '@shared/models';
import { EmbeddingModelsService, RealtimeModelsService } from '@shared/services';
import { forkJoin, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { LLMModel } from '../../../../shared/models/llms/llm.model';
import { GetRealtimeTranscriptionModelRequest } from '../../../transcription/models/transcription-config.model';
import { RealtimeTranscriptionModelsService } from '../../../transcription/services/transcription-models.service';
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';
import { EmbeddingConfigStorageService } from './embedding-config-storage.service';
import { LlmConfigStorageService } from './llm-config-storage.service';
import { LlmModelsStorageService } from './llm-models-storage.service';
import { LlmProvidersStorageService } from './llm-providers-storage.service';
import { RealtimeConfigStorageService } from './realtime-config-storage.service';
import { TranscriptionConfigStorageService } from './transcription-config-storage.service';

type AnyModel = LLMModel | EmbeddingModel | RealtimeModel | GetRealtimeTranscriptionModelRequest;

export interface ProviderWithModels<T extends { id: number; name: string } = AnyModel> {
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
    private readonly embeddingConfigStorage = inject(EmbeddingConfigStorageService);
    private readonly realtimeConfigStorage = inject(RealtimeConfigStorageService);
    private readonly transcriptionConfigStorage = inject(TranscriptionConfigStorageService);

    private readonly embeddingModelsSignal = signal<EmbeddingModel[]>([]);
    private readonly realtimeModelsSignal = signal<RealtimeModel[]>([]);
    private readonly transcriptionModelsSignal = signal<GetRealtimeTranscriptionModelRequest[]>([]);

    private providerIdExtractors: Record<ModelTypes, (model: AnyModel) => number> = {
        [ModelTypes.LLM]: (m) => (m as LLMModel).llm_provider,
        [ModelTypes.TRANSCRIPTION]: (m) => (m as GetRealtimeTranscriptionModelRequest).provider,
        [ModelTypes.REALTIME]: (m) => (m as RealtimeModel).provider,
        [ModelTypes.EMBEDDING]: (m) => (m as EmbeddingModel).embedding_provider!,
    };

    private visibilityExtractors: Record<ModelTypes, (model: AnyModel) => boolean> = {
        [ModelTypes.LLM]: (m) => (m as LLMModel).is_visible,
        [ModelTypes.EMBEDDING]: (m) => (m as EmbeddingModel).is_visible,
        [ModelTypes.REALTIME]: (_m) => true,
        [ModelTypes.TRANSCRIPTION]: (_m) => true,
    };

    private buildProviderGroups<
        TConfig extends { id: number; custom_name: string },
        TModel extends { id: number; name: string },
    >(
        configs: TConfig[],
        models: TModel[],
        providers: LLMProvider[],
        type: ModelTypes,
        getModelId: (config: TConfig) => number,
        getProviderId: (model: TModel) => number,
        getTemperature: (config: TConfig) => number,
        getTags: (config: TConfig) => Tag[]
    ): LlmLibraryProviderGroup[] {
        const modelMap = new Map(models.map((m) => [m.id, m]));
        const providerMap = new Map(providers.map((p) => [p.id, p]));
        const groupsMap = new Map<string, LlmLibraryProviderGroup>();

        for (const config of configs) {
            const model = modelMap.get(getModelId(config));
            if (!model) continue;
            const provider = providerMap.get(getProviderId(model));
            if (!provider) continue;
            const groupKey = `${type}-${provider.id}`;
            if (!groupsMap.has(groupKey)) {
                const iconKey = provider.name.toLowerCase();
                groupsMap.set(groupKey, {
                    id: groupKey,
                    providerName: provider.name,
                    providerIconPath: PROVIDER_ICON_PATHS[iconKey] ?? PROVIDER_ICON_PATHS['default'],
                    models: [],
                    configType: type,
                });
            }
            groupsMap.get(groupKey)!.models.push({
                id: config.id,
                customName: config.custom_name,
                modelName: model.name,
                tags: getTags(config),
                temperature: getTemperature(config),
                usedByCount: null,
                configType: type,
            });
        }

        return Array.from(groupsMap.values());
    }

    public readonly providerGroups = computed<LlmLibraryProviderGroup[]>(() => {
        const providersByType = this.providersStorage.providersByType();

        return [
            ...this.buildProviderGroups(
                this.configStorage.configs(),
                this.llmModelsStorage.models(),
                providersByType.get(ModelTypes.LLM) ?? [],
                ModelTypes.LLM,
                (c) => c.model,
                (m) => m.llm_provider,
                (c) => c.temperature ?? 0,
                (c) => c.tags
            ),
            ...this.buildProviderGroups(
                this.embeddingConfigStorage.configs(),
                this.embeddingModelsSignal(),
                providersByType.get(ModelTypes.EMBEDDING) ?? [],
                ModelTypes.EMBEDDING,
                (c) => c.model,
                (m) => m.embedding_provider!,
                (_c) => 0,
                (_c) => []
            ),
            ...this.buildProviderGroups(
                this.realtimeConfigStorage.configs(),
                this.realtimeModelsSignal(),
                providersByType.get(ModelTypes.REALTIME) ?? [],
                ModelTypes.REALTIME,
                (c) => c.realtime_model,
                (m) => m.provider,
                (_c) => 0,
                (_c) => []
            ),
            ...this.buildProviderGroups(
                this.transcriptionConfigStorage.configs(),
                this.transcriptionModelsSignal(),
                providersByType.get(ModelTypes.TRANSCRIPTION) ?? [],
                ModelTypes.TRANSCRIPTION,
                (c) => c.realtime_transcription_model,
                (m) => m.provider,
                (_c) => 0,
                (_c) => []
            ),
        ];
    });

    loadConfigs(): Observable<void> {
        return forkJoin({
            configs: this.configStorage.getAllConfigs(),
            models: this.llmModelsStorage.getModels(),
            llmProviders: this.providersStorage.getProvidersByType(ModelTypes.LLM),
            embeddingConfigs: this.embeddingConfigStorage.getAllConfigs(),
            embeddingModels: this.embeddingModelsService.getEmbeddingModels(),
            embeddingProviders: this.providersStorage.getProvidersByType(ModelTypes.EMBEDDING),
            realtimeConfigs: this.realtimeConfigStorage.getAllConfigs(),
            realtimeModels: this.realtimeModelsService.getAllModels(),
            realtimeProviders: this.providersStorage.getProvidersByType(ModelTypes.REALTIME),
            transcriptionConfigs: this.transcriptionConfigStorage.getAllConfigs(),
            transcriptionModels: this.transcriptionModelsService.getAllModels().pipe(map((r) => r.results)),
            transcriptionProviders: this.providersStorage.getProvidersByType(ModelTypes.TRANSCRIPTION),
        }).pipe(
            tap(({ embeddingModels, realtimeModels, transcriptionModels }) => {
                this.embeddingModelsSignal.set(embeddingModels);
                this.realtimeModelsSignal.set(realtimeModels);
                this.transcriptionModelsSignal.set(transcriptionModels);
            }),
            map(() => void 0)
        );
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

    private getModelsByType(type: ModelTypes): Observable<AnyModel[]> {
        switch (type) {
            case ModelTypes.LLM:
                return this.llmModelsStorage.getModels();

            case ModelTypes.TRANSCRIPTION:
                return this.transcriptionModelsService.getAllModels().pipe(map((res) => res.results));

            case ModelTypes.REALTIME:
                return this.realtimeModelsService.getAllModels();

            case ModelTypes.EMBEDDING:
                return this.embeddingModelsService.getEmbeddingModels();

            default:
                return this.llmModelsStorage.getModels();
        }
    }

    private groupModelsByProvider<T>(models: T[], getProviderId: (model: T) => number): Map<number, T[]> {
        const map = new Map<number, T[]>();

        for (const model of models) {
            const providerId = getProviderId(model);
            const list = map.get(providerId) ?? [];

            list.push(model);
            map.set(providerId, list);
        }

        return map;
    }

    private mapToProviderWithModels<T extends { id: number; name: string }>(
        providers: LLMProvider[],
        modelsMap: Map<number, T[]>,
        isVisible: (model: T) => boolean
    ): ProviderWithModels<T>[] {
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
