import { Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { RealtimeModelsService } from './real-time-models.service';
import { RealtimeModelConfigsService } from './real-time-model-config.service';
import { LLMProvidersService } from '../llms/llm-providers.service';
import { LLMProvider, ModelTypes } from '@shared/models';
import { RealtimeModelConfig, RealtimeModel } from '@shared/models';

export interface FullRealtimeConfig extends RealtimeModelConfig {
  modelDetails: RealtimeModel | null;
  providerDetails: LLMProvider | null;
}

@Injectable({
  providedIn: 'root',
})
export class FullRealtimeConfigService {
  constructor(
    private realtimeModelConfigsService: RealtimeModelConfigsService,
    private realtimeModelsService: RealtimeModelsService,
    private providersService: LLMProvidersService
  ) {}

  getFullRealtimeConfigs(): Observable<{
    fullConfigs: FullRealtimeConfig[];
    models: RealtimeModel[];
  }> {
    return forkJoin({
      configs: this.realtimeModelConfigsService.getAllConfigs(),
      models: this.realtimeModelsService.getAllModels(),
      providers: this.providersService.getProvidersByQuery(ModelTypes.REALTIME),
    }).pipe(
      map(({ configs, models, providers }) => {
        // Build lookup tables for models and providers
        const modelMap: Record<number, RealtimeModel> = {};
        models.forEach((model) => {
          modelMap[model.id] = model;
        });

        const providerMap: Record<number, LLMProvider> = {};
        providers.forEach((provider) => {
          providerMap[provider.id] = provider;
        });

        // Merge each config with its corresponding model and provider details
        const fullConfigs: FullRealtimeConfig[] = configs.map((config) => {
          const modelDetails = modelMap[config.realtime_model] || null;
          const providerDetails = modelDetails?.provider
            ? providerMap[modelDetails.provider]
            : null;

          return {
            ...config,
            modelDetails,
            providerDetails,
          };
        });

        // Return both the enriched configs and the full list of models
        return { fullConfigs, models };
      })
    );
  }
}
