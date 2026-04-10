import { Injectable } from '@angular/core';
import { EmbeddingModel, GetEmbeddingConfigRequest, LLMProvider, ModelTypes } from '@shared/models';
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { LLMProvidersService } from '../llms/llm-providers.service';
import { EmbeddingConfigsService } from './embedding-configs.service';
import { EmbeddingModelsService } from './embeddings.service';

export interface FullEmbeddingConfig extends GetEmbeddingConfigRequest {
    modelDetails: EmbeddingModel | null;
    providerDetails: LLMProvider | null;
}

@Injectable({
    providedIn: 'root',
})
export class FullEmbeddingConfigService {
    constructor(
        private embeddingConfigService: EmbeddingConfigsService,
        private embeddingModelsService: EmbeddingModelsService,
        private providersService: LLMProvidersService
    ) {}

    getFullEmbeddingConfigs(): Observable<FullEmbeddingConfig[]> {
        return forkJoin({
            configs: this.embeddingConfigService.getEmbeddingConfigs(),
            models: this.embeddingModelsService.getEmbeddingModels(),
            providers: this.providersService.getProvidersByQuery(ModelTypes.EMBEDDING),
        }).pipe(
            map(({ configs, models, providers }) => {
                // Create lookup tables for models and providers
                const modelMap: Record<number, EmbeddingModel> = {};
                models.forEach((model) => {
                    modelMap[model.id] = model;
                });

                const providerMap: Record<number, LLMProvider> = {};
                providers.forEach((provider) => {
                    providerMap[provider.id] = provider;
                });

                const visibleConfigs = configs.filter((config) => config);

                return visibleConfigs.map((config) => {
                    const modelDetails = modelMap[config.model] || null;
                    const providerDetails = modelDetails?.embedding_provider
                        ? providerMap[modelDetails.embedding_provider]
                        : null;

                    return {
                        ...config,
                        modelDetails,
                        providerDetails,
                    };
                });
            })
        );
    }
}
