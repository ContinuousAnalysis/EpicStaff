import { computed, inject, Injectable } from '@angular/core';
import { LLMModel, LLMProvider, ModelTypes } from "@shared/models";
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PROVIDER_ICON_PATHS } from '@shared/constants';
import { LlmLibraryModel } from '../../interfaces/llm-library-model.interface';
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';

import { LlmConfigStorageService } from './llm-config-storage.service';
import { LlmModelsStorageService } from './llm-models-storage.service';
import { LlmProvidersStorageService } from './llm-providers-storage.service';

export interface ProviderWithModels {
    provider: LLMProvider;
    models: LLMModel[];
    visibleModels: LLMModel[];
}

@Injectable({
    providedIn: 'root',
})
export class LLMLibraryService {
    private readonly configStorage = inject(LlmConfigStorageService);
    private readonly modelsStorage = inject(LlmModelsStorageService);
    private readonly providersStorage = inject(LlmProvidersStorageService);

    public readonly providerGroups = computed<LlmLibraryProviderGroup[]>(() => {
        const configs = this.configStorage.configs();
        const models = this.modelsStorage.models();
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
                tags: [],
                temperature: config.temperature ?? 0,
                usedByCount: null,
            };

            groupsMap.get(provider.id)!.models.push(libraryModel);
        }

        return Array.from(groupsMap.values());
    });

    // Models grouped by provider — used by the model selector
    public readonly providerModels = computed<ProviderWithModels[]>(() => {
        const providers = this.providersStorage.providersByType().get(ModelTypes.LLM) ?? [];
        const byProvider = this.modelsStorage.modelsByProvider();
        return providers.map((provider) => {
            const allModels = byProvider.get(provider.id) ?? [];
            const visibleModels = allModels.filter((m) => m.is_visible);
            return { provider, models: allModels, visibleModels };
        });
    });

    loadConfigs(): Observable<void> {
        return forkJoin({
            configs: this.configStorage.getAllConfigs(),
            models: this.modelsStorage.getModels(),
            providers: this.providersStorage.getProvidersByType(ModelTypes.LLM),
        }).pipe(map(() => void 0));
    }

    loadModels(): Observable<void> {
        return forkJoin({
            models: this.modelsStorage.getModels(),
            providers: this.providersStorage.getProvidersByType(ModelTypes.LLM),
        }).pipe(map(() => void 0));
    }
}
