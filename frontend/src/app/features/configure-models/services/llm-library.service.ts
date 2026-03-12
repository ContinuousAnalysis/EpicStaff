import { computed, inject, Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PROVIDER_ICON_PATHS } from '../constants/provider-icons.constants';
import { LlmLibraryModel } from '../interfaces/llm-library-model.interface';
import { LlmLibraryProviderGroup } from '../interfaces/llm-library-provider-group.interface';
import { LLM_Provider, ModelTypes } from '../models/llm-provider.model';
import { LLM_Model } from '../models/llms/LLM.model';
import { LlmConfigStorageService } from './llms/llm-config-storage.service';
import { LlmModelsStorageService } from './llms/llm-models-storage.service';
import { LlmProvidersStorageService } from './llms/llm-providers-storage.service';

export interface ProviderWithModels {
    provider: LLM_Provider;
    models: LLM_Model[];
    visibleModels: LLM_Model[];
}

@Injectable({
    providedIn: 'root',
})
export class LlmLibraryService {
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
