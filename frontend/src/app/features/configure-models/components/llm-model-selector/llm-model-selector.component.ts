import { Dialog } from "@angular/cdk/dialog";
import { UpperCasePipe } from "@angular/common";
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    forwardRef,
    inject,
    input,
    model,
    output,
    signal,
    ViewChild,
    ViewContainerRef,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayModule, OverlayPositionBuilder, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AppIconComponent, ButtonComponent, TooltipComponent } from "@shared/components";
import { forkJoin } from "rxjs";
import { finalize } from "rxjs/operators";
import { LLM_Provider } from "../../../settings-dialog/models/llm-provider.model";
import { ModelTypes } from "../../models/llm-provider.model";
import { LLM_Model } from "../../models/llms/LLM.model";
import { LlmModelsStorageService } from "../../services/llms/llm-models-storage.service";
import { LlmProvidersStorageService } from "../../services/llms/llm-providers-storage.service";
import { getProviderIconPath } from "../../utils/get-provider-icon";

import { CreateLlmModelModalComponent } from "../create-llm-model-modal/create-llm-model-modal.component";

interface ProviderWithModels {
    provider: LLM_Provider;
    models: LLM_Model[];
    visibleModels: LLM_Model[];
}

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
    selector: 'app-llm-model-selector',
    imports: [FormsModule, OverlayModule, AppIconComponent, TooltipComponent, UpperCasePipe, ButtonComponent],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => LlmModelSelectorComponent),
            multi: true,
        },
    ],
    templateUrl: './llm-model-selector.component.html',
    styleUrls: ['./llm-model-selector.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
// TODO refactor needed
export class LlmModelSelectorComponent implements ControlValueAccessor {
    private providersStorageService = inject(LlmProvidersStorageService);
    private modelsStorageService = inject(LlmModelsStorageService);
    private destroyRef = inject(DestroyRef);
    private dialog = inject(Dialog);
    private overlayRef!: OverlayRef;
    private overlay = inject(Overlay);
    private overlayPositionBuilder = inject(OverlayPositionBuilder);
    private vcr = inject(ViewContainerRef);

    placeholder = input<string>('Select LLM model');
    icon = input<string>('help_outline');
    label = input<string>('');
    required = input<boolean>(false);
    tooltipText = input<string>('');

    isLoading = signal(true);
    searchQuery = signal('');
    providersWithModels = signal<ProviderWithModels[]>([]);
    selectedModelId = signal<number | null>(null);

    selectedValue = model<number | null>(null);
    modelChanged = output<LLM_Model>();
    configAdded = output<void>();

    readonly COLLAPSED_COUNT = 3;
    readonly COLLAPSE_THRESHOLD = 4;

    open = signal(false);
    isDisabled = signal(false);
    expandedProviders = signal<Set<number>>(new Set());

    selectedModelInfo = computed<{ model: LLM_Model; provider: LLM_Provider } | null>(() => {
        const id = this.selectedValue();
        if (id === null || id === undefined) return null;
        for (const group of this.providersWithModels()) {
            const model = group.models.find(m => m.id === id);
            if (model) return { model, provider: group.provider };
        }
        return null;
    });

    filteredProviders = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const providers = this.providersWithModels();

        if (!query) {
            return providers;
        }

        return providers
            .map(p => {
                const providerMatches = p.provider.name.toLowerCase().includes(query);
                const matchingModels = p.visibleModels.filter(m =>
                    m.name.toLowerCase().includes(query)
                );

                if (providerMatches) return p;

                if (matchingModels.length > 0) {
                    return { ...p, visibleModels: matchingModels };
                }

                return null;
            })
            .filter((p): p is ProviderWithModels => p !== null);
    });

    @ViewChild('triggerBtn') triggerBtn!: ElementRef<HTMLButtonElement>;
    @ViewChild('dropdownTemplate') dropdownTemplate!: any;

    private onChange: (value: number | null) => void = () => {
    };
    private onTouched: () => void = () => {
    };

    toggle(): void {
        this.open() ? this.close() : this.openDropdown();
    }

    openDropdown(): void {
        if (!this.overlayRef) {
            const positionStrategy = this.overlayPositionBuilder
                .flexibleConnectedTo(this.triggerBtn)
                .withPositions([
                    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
                    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
                ])
                .withPush(true);

            this.overlayRef = this.overlay.create({
                positionStrategy,
                scrollStrategy: this.overlay.scrollStrategies.reposition(),
                hasBackdrop: true,
                backdropClass: 'transparent-backdrop',
                width: this.triggerBtn.nativeElement.offsetWidth,
            });

            this.overlayRef.backdropClick().subscribe(() => this.close());
        }

        const portal = new TemplatePortal(this.dropdownTemplate, this.vcr);
        this.overlayRef.attach(portal);
        this.open.set(true);
    }

    close(): void {
        if (this.overlayRef) this.overlayRef.detach();
        this.onTouched();
        this.open.set(false);
    }

    ngOnInit(): void {
        this.loadProvidersAndModels();
    }

    private sortProviders(providers: LLM_Provider[]): LLM_Provider[] {
        return [...providers].sort((a, b) => {
            const aIndex = TOP_PROVIDERS.indexOf(a.name.toLowerCase());
            const bIndex = TOP_PROVIDERS.indexOf(b.name.toLowerCase());

            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    private loadProvidersAndModels(): void {
        this.isLoading.set(true);

        this.providersStorageService
            .getProvidersByType(ModelTypes.LLM)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (providers) => {
                    const sortedProviders = this.sortProviders(providers);

                    const modelRequests = sortedProviders.map(provider =>
                        this.modelsStorageService.getModels(provider.id, true)
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
                                    const visibleModels = modelsArrays[index] || [];

                                    return {
                                        provider,
                                        models: visibleModels,
                                        visibleModels,
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

    selectModel(model: LLM_Model): void {
        this.selectedModelId.set(model.id);
        this.selectedValue.set(model.id);
        this.onChange(model.id);
        this.modelChanged.emit(model);
        this.close();
    }

    isModelSelected(modelId: number): boolean {
        return this.selectedModelId() === modelId;
    }

    getVisibleModels(group: ProviderWithModels): LLM_Model[] {
        if (this.searchQuery().trim() || this.expandedProviders().has(group.provider.id)) {
            return group.visibleModels;
        }
        return group.visibleModels.slice(0, this.COLLAPSED_COUNT);
    }

    isCollapsible(group: ProviderWithModels): boolean {
        return group.visibleModels.length > this.COLLAPSE_THRESHOLD && !this.searchQuery().trim();
    }

    hiddenCount(group: ProviderWithModels): number {
        return group.visibleModels.length - this.COLLAPSED_COUNT;
    }

    toggleExpand(providerId: number): void {
        this.expandedProviders.update(set => {
            const next = new Set(set);
            next.has(providerId) ? next.delete(providerId) : next.add(providerId);
            return next;
        });
    }

    openAllModelsModal(provider: LLM_Provider): void {
        const createDialogRef = this.dialog.open(CreateLlmModelModalComponent, {
            data: { provider },
            width: '600px',
        });
        createDialogRef.closed
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((createdModel) => {
                if (!createdModel) {
                    return;
                }

                const created = createdModel as LLM_Model;
                this.reloadProviderModels(provider.id);
            });
    }

    private reloadProviderModels(providerId: number): void {
        this.modelsStorageService.getModels(providerId, true).pipe(
            takeUntilDestroyed(this.destroyRef)
        ).subscribe({
            next: (visibleModels) => {
                this.providersWithModels.update(providers => {
                    return providers.map(p => {
                        if (p.provider.id !== providerId) return p;
                        return {
                            ...p,
                            models: visibleModels,
                            visibleModels,
                        };
                    });
                });
            }
        });
    }

    writeValue(value: number | null): void {
        this.selectedValue.set(value ?? null);
    }

    registerOnChange(fn: (value: number | null) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.isDisabled.set(isDisabled);
    }
}
