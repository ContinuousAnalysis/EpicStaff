import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    inject,
    signal,
    computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { AppIconComponent } from '../../../../../shared/components/app-icon/app-icon.component';
import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';
import { LLM_Provider, ModelTypes } from '../../../models/LLM_provider.model';
import { LLM_Model } from '../../../models/llms/LLM.model';
import { LLM_Providers_Service } from '../../../services/LLM_providers.service';
import { LLM_Models_Service } from '../../../services/llms/LLM_models.service';
import { getProviderIconPath } from '../../../utils/get-provider-icon';
import { AllModelsModalComponent, AllModelsResult } from '../all-models-modal/all-models-modal.component';

export interface ModelSelectorDialogData {
    selectedModelId?: number | null;
}

export interface ModelSelectorResult {
    provider: LLM_Provider;
    model: LLM_Model;
}

interface ProviderWithModels {
    provider: LLM_Provider;
    models: LLM_Model[];
    favoriteModels: LLM_Model[];
    favoriteModelIds: Set<number>;
}

// Priority order for top providers
const TOP_PROVIDERS = [
    'openai',
    'anthropic',
    'google_ai',
    'azure',
    'groq',
    'mistral',
    'deepseek',
    'ollama',
    'bedrock',
    'huggingface',
];

@Component({
    selector: 'app-model-selector-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, AppIconComponent, ButtonComponent],
    templateUrl: './model-selector-modal.component.html',
    styleUrls: ['./model-selector-modal.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelSelectorModalComponent implements OnInit {
    private dialogRef = inject(DialogRef);
    private dialog = inject(Dialog);
    private dialogData = inject<ModelSelectorDialogData | null>(DIALOG_DATA, { optional: true });
    private providersService = inject(LLM_Providers_Service);
    private modelsService = inject(LLM_Models_Service);
    private destroyRef = inject(DestroyRef);

    // State
    isLoading = signal(true);
    searchQuery = signal('');
    providersWithModels = signal<ProviderWithModels[]>([]);
    selectedModelId = signal<number | null>(null);
    selectedModel = signal<LLM_Model | null>(null);
    selectedProvider = signal<LLM_Provider | null>(null);

    // Computed
    filteredProviders = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const providers = this.providersWithModels();

        if (!query) {
            return providers;
        }

        return providers
            .map(p => {
                const providerMatches = p.provider.name.toLowerCase().includes(query);
                const matchingModels = p.favoriteModels.filter(m =>
                    m.name.toLowerCase().includes(query)
                );

                if (providerMatches) {
                    return p;
                }

                if (matchingModels.length > 0) {
                    return {
                        ...p,
                        favoriteModels: matchingModels,
                    };
                }

                return null;
            })
            .filter((p): p is ProviderWithModels => p !== null);
    });

    ngOnInit(): void {
        if (this.dialogData?.selectedModelId) {
            this.selectedModelId.set(this.dialogData.selectedModelId);
        }
        this.loadProvidersAndModels();
    }

    private sortProviders(providers: LLM_Provider[]): LLM_Provider[] {
        return [...providers].sort((a, b) => {
            const aIndex = TOP_PROVIDERS.indexOf(a.name.toLowerCase());
            const bIndex = TOP_PROVIDERS.indexOf(b.name.toLowerCase());

            // If both are in the priority list, sort by priority
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            // If only a is in priority list, a comes first
            if (aIndex !== -1) return -1;
            // If only b is in priority list, b comes first
            if (bIndex !== -1) return 1;
            // Otherwise, alphabetical
            return a.name.localeCompare(b.name);
        });
    }

    private loadProvidersAndModels(): void {
        this.isLoading.set(true);

        this.providersService
            .getProvidersByQuery(ModelTypes.LLM)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (providers) => {
                    // Sort providers with top ones first
                    const sortedProviders = this.sortProviders(providers);

                    // Load models for all providers in parallel
                    const modelRequests = sortedProviders.map(provider =>
                        this.modelsService.getLLMModels(provider.id)
                    );

                    if (modelRequests.length === 0) {
                        this.providersWithModels.set([]);
                        this.isLoading.set(false);
                        return;
                    }

                    forkJoin(modelRequests)
                        .pipe(
                            takeUntilDestroyed(this.destroyRef),
                            finalize(() => this.isLoading.set(false))
                        )
                        .subscribe({
                            next: (modelsArrays) => {
                                const providersWithModels: ProviderWithModels[] = sortedProviders.map((provider, index) => {
                                    const models = modelsArrays[index] || [];
                                    // First 5 models are "favorites" (shown by default)
                                    const favoriteModels = models.slice(0, 5);
                                    const favoriteModelIds = new Set(favoriteModels.map(m => m.id));

                                    // Check if selected model belongs to this provider
                                    const selectedId = this.selectedModelId();
                                    if (selectedId) {
                                        const selectedInProvider = models.find(m => m.id === selectedId);
                                        if (selectedInProvider) {
                                            this.selectedModel.set(selectedInProvider);
                                            this.selectedProvider.set(provider);
                                        }
                                    }

                                    return {
                                        provider,
                                        models,
                                        favoriteModels,
                                        favoriteModelIds,
                                    };
                                });

                                this.providersWithModels.set(providersWithModels);
                            },
                            error: (err) => {
                                console.error('Error loading models:', err);
                                this.isLoading.set(false);
                            },
                        });
                },
                error: (err) => {
                    console.error('Error loading providers:', err);
                    this.isLoading.set(false);
                },
            });
    }

    getProviderIcon(providerName: string): string {
        return getProviderIconPath(providerName);
    }

    onSearchChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.searchQuery.set(target.value);
    }

    toggleModelSelection(provider: LLM_Provider, model: LLM_Model): void {
        const currentId = this.selectedModelId();
        if (currentId === model.id) {
            // Deselect
            this.selectedModelId.set(null);
            this.selectedModel.set(null);
            this.selectedProvider.set(null);
        } else {
            // Select
            this.selectedModelId.set(model.id);
            this.selectedModel.set(model);
            this.selectedProvider.set(provider);
        }
    }

    isModelSelected(modelId: number): boolean {
        return this.selectedModelId() === modelId;
    }

    isModelFavorite(providerData: ProviderWithModels, modelId: number): boolean {
        return providerData.favoriteModelIds.has(modelId);
    }

    toggleFavorite(event: Event, providerData: ProviderWithModels, model: LLM_Model): void {
        event.stopPropagation();
        
        this.providersWithModels.update(providers => {
            return providers.map(p => {
                if (p.provider.id !== providerData.provider.id) return p;

                const newFavoriteIds = new Set(p.favoriteModelIds);
                let newFavorites = [...p.favoriteModels];

                if (newFavoriteIds.has(model.id)) {
                    // Remove from favorites
                    newFavoriteIds.delete(model.id);
                    newFavorites = newFavorites.filter(m => m.id !== model.id);
                } else {
                    // Add to favorites
                    newFavoriteIds.add(model.id);
                    newFavorites.push(model);
                }

                return {
                    ...p,
                    favoriteModels: newFavorites,
                    favoriteModelIds: newFavoriteIds,
                };
            });
        });
    }

    openAllModelsModal(provider: LLM_Provider, providerData: ProviderWithModels): void {
        const dialogRef = this.dialog.open(AllModelsModalComponent, {
            data: {
                provider,
                models: providerData.models,
                favoriteModelIds: providerData.favoriteModelIds,
            },
        });

        dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
            if (result) {
                const { favoriteModelIds } = result as AllModelsResult;
                
                // Update favorites for this provider
                this.providersWithModels.update(providers => {
                    return providers.map(p => {
                        if (p.provider.id !== provider.id) return p;

                        const newFavorites = p.models.filter(m => favoriteModelIds.has(m.id));
                        
                        return {
                            ...p,
                            favoriteModels: newFavorites,
                            favoriteModelIds,
                        };
                    });
                });
            }
        });
    }

    onConfirm(): void {
        const model = this.selectedModel();
        const provider = this.selectedProvider();
        
        if (model && provider) {
            const result: ModelSelectorResult = { provider, model };
            this.dialogRef.close(result);
        } else {
            this.dialogRef.close(null);
        }
    }

    onClose(): void {
        // On close (click outside), apply selection if exists
        const model = this.selectedModel();
        const provider = this.selectedProvider();
        
        if (model && provider) {
            const result: ModelSelectorResult = { provider, model };
            this.dialogRef.close(result);
        } else {
            this.dialogRef.close(null);
        }
    }
}
