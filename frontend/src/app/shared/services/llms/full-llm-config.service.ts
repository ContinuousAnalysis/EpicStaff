import { Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { GetLlmConfigRequest, GetLlmModelRequest } from '@shared/models';
import { LLMProvider, ModelTypes } from '@shared/models';
import { LLMConfigService } from './llm-config.service';
import { LLMModelsService } from './llm-models.service';
import { LLMProvidersService } from '@shared/services';

export interface FullLLMConfig extends GetLlmConfigRequest {
  modelDetails: GetLlmModelRequest | null;
  providerDetails: LLMProvider | null;
}

@Injectable({
  providedIn: 'root',
})
export class FullLLMConfigService {
  constructor(
    private llmConfigService: LLMConfigService,
    private llmModelsService: LLMModelsService,
    private llmProvidersService: LLMProvidersService
  ) {}

  getFullLLMConfigs(): Observable<FullLLMConfig[]> {
    return forkJoin({
      configs: this.llmConfigService.getAllConfigsLLM(),
      models: this.llmModelsService.getLLMModels(),
      providers: this.llmProvidersService.getProvidersByQuery(ModelTypes.LLM),
    }).pipe(
      map(({ configs, models, providers }) => {
        const modelMap: Record<number, GetLlmModelRequest> = {};
        models.forEach((model) => {
          modelMap[model.id] = model;
        });

        const providerMap: Record<number, LLMProvider> = {};
        providers.forEach((provider) => {
          providerMap[provider.id] = provider;
        });

        const visibleConfigs = configs.filter((config) => config);
        console.log('models', modelMap);
        return visibleConfigs.map((config) => {
          const modelDetails = modelMap[config.model] || null;
          const providerDetails = modelDetails?.llm_provider
            ? providerMap[modelDetails.llm_provider]
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
