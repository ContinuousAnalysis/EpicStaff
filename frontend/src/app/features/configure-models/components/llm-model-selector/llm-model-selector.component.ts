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
import { finalize } from "rxjs/operators";
import { LLM_Model } from "../../models/llms/LLM.model";
import { LlmLibraryService, ProviderWithModels } from "../../services/llm-library.service";
import { getProviderIconPath } from "../../utils/get-provider-icon";

import { CreateLlmModelModalComponent } from "../create-llm-model-modal/create-llm-model-modal.component";

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
export class LlmModelSelectorComponent implements ControlValueAccessor {
    private llmLibraryService = inject(LlmLibraryService);
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
    selectedValue = model<number | null>(null);
    modelChanged = output<LLM_Model>();
    configAdded = output<void>();

    readonly COLLAPSED_COUNT = 3;
    readonly COLLAPSE_THRESHOLD = 4;

    open = signal(false);
    isDisabled = signal(false);
    expandedProviders = signal<Set<number>>(new Set());

    providersWithModels = computed<ProviderWithModels[]>(() =>
        [...this.llmLibraryService.providerModels()].sort((a, b) => {
            const aIndex = TOP_PROVIDERS.indexOf(a.provider.name.toLowerCase());
            const bIndex = TOP_PROVIDERS.indexOf(b.provider.name.toLowerCase());
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.provider.name.localeCompare(b.provider.name);
        })
    );

    selectedModelInfo = computed<{ model: LLM_Model; provider: ProviderWithModels['provider'] } | null>(() => {
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

    private onChange: (value: number | null) => void = () => {};
    private onTouched: () => void = () => {};

    ngOnInit(): void {
        this.llmLibraryService.loadModels()
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isLoading.set(false))
            )
            .subscribe();
    }

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

    getProviderIcon(providerName: string): string {
        return getProviderIconPath(providerName);
    }

    onSearchChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.searchQuery.set(target.value);
    }

    selectModel(model: LLM_Model): void {
        this.selectedValue.set(model.id);
        this.onChange(model.id);
        this.modelChanged.emit(model);
        this.close();
    }

    isModelSelected(modelId: number): boolean {
        return this.selectedValue() === modelId;
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

    openAllModelsModal(provider: ProviderWithModels['provider']): void {
        this.dialog.open(CreateLlmModelModalComponent, {
            data: { provider },
            width: '600px',
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
