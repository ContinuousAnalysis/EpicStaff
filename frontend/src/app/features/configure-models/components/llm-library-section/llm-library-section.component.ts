import { Dialog } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
    ButtonComponent,
    ConfirmationDialogData,
    ConfirmationDialogService,
    IconButtonComponent,
    LoadingSpinnerComponent,
    SelectComponent,
    SelectItem,
} from '@shared/components';
import { AppSvgIconComponent } from '@shared/components';
import { ModelTypes } from '@shared/models';
import { Observable } from 'rxjs';

import { ToastService } from '../../../../services/notifications';
import { ElevenLabsRealtimeConfig } from '../../../../shared/models/realtime-voice/elevenlabs-realtime-config.model';
import { GeminiRealtimeConfig } from '../../../../shared/models/realtime-voice/gemini-realtime-config.model';
import { OpenAIRealtimeConfig } from '../../../../shared/models/realtime-voice/openai-realtime-config.model';
import { LlmLibraryModel } from '../../interfaces/llm-library-model.interface';
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';
import { DefaultModelsStorageService } from '../../services/default-models-storage.service';
import { ElevenLabsRealtimeConfigStorageService } from '../../services/llms/elevenlabs-realtime-config-storage.service';
import { EmbeddingConfigStorageService } from '../../services/llms/embedding-config-storage.service';
import { GeminiRealtimeConfigStorageService } from '../../services/llms/gemini-realtime-config-storage.service';
import { LlmConfigStorageService } from '../../services/llms/llm-config-storage.service';
import { LLMLibraryService } from '../../services/llms/llm-library.service';
import { OpenAIRealtimeConfigStorageService } from '../../services/llms/openai-realtime-config-storage.service';
import { RealtimeConfigStorageService } from '../../services/llms/realtime-config-storage.service';
import { TranscriptionConfigStorageService } from '../../services/llms/transcription-config-storage.service';
import { ElevenLabsRealtimeConfigDialogComponent } from '../elevenlabs-realtime-config-dialog/elevenlabs-realtime-config-dialog.component';
import { EmbeddingModelConfigDialogComponent } from '../embedding-model-config-dialog/embedding-model-config-dialog.component';
import { GeminiRealtimeConfigDialogComponent } from '../gemini-realtime-config-dialog/gemini-realtime-config-dialog.component';
import { LlmLibraryCardComponent } from '../llm-library-card/llm-library-card.component';
import { LlmModelConfigDialogComponent } from '../llm-model-config-dialog/llm-model-config-dialog.component';
import { OpenAIRealtimeConfigDialogComponent } from '../openai-realtime-config-dialog/openai-realtime-config-dialog.component';
import { TranscriptionModelConfigDialogComponent } from '../transcription-model-config-dialog/transcription-model-config-dialog.component';
import { VoiceModelConfigDialogComponent } from '../voice-config-model/voice-model-config-dialog.component';

@Component({
    selector: 'app-llm-library-section',
    imports: [
        CommonModule,
        FormsModule,
        LlmLibraryCardComponent,
        AppSvgIconComponent,
        LoadingSpinnerComponent,
        SelectComponent,
        ButtonComponent,
        IconButtonComponent,
    ],
    templateUrl: './llm-library-section.component.html',
    styleUrls: ['./llm-library-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LlmLibrarySectionComponent implements OnInit {
    private llmLibraryService = inject(LLMLibraryService);
    private llmConfigStorageService = inject(LlmConfigStorageService);
    private embeddingConfigStorage = inject(EmbeddingConfigStorageService);
    private realtimeConfigStorage = inject(RealtimeConfigStorageService);
    private transcriptionConfigStorage = inject(TranscriptionConfigStorageService);
    private openaiRealtimeStorage = inject(OpenAIRealtimeConfigStorageService);
    private elevenLabsRealtimeStorage = inject(ElevenLabsRealtimeConfigStorageService);
    private geminiRealtimeStorage = inject(GeminiRealtimeConfigStorageService);
    private confirmationDialogService = inject(ConfirmationDialogService);
    private defaultModelsStorageService = inject(DefaultModelsStorageService);
    private destroyRef = inject(DestroyRef);
    private dialog = inject(Dialog);
    private toast = inject(ToastService);

    // New per-provider realtime configs (flat lists, no provider-group nesting)
    openaiRealtimeConfigs = this.openaiRealtimeStorage.configs;
    elevenLabsRealtimeConfigs = this.elevenLabsRealtimeStorage.configs;
    geminiRealtimeConfigs = this.geminiRealtimeStorage.configs;

    public providerGroups = this.llmLibraryService.providerGroups;
    public configs = this.llmConfigStorageService.configs;
    public searchQuery = signal('');
    public selectedCapability = signal<unknown>(null);
    public configsLoaded = signal<boolean>(false);

    readonly configTypeSections: { type: ModelTypes; label: string }[] = [
        { type: ModelTypes.LLM, label: 'LLM' },
        { type: ModelTypes.EMBEDDING, label: 'Embedding' },
        { type: ModelTypes.REALTIME, label: 'Voice' },
        { type: ModelTypes.TRANSCRIPTION, label: 'Transcription' },
    ];

    filteredGroups = computed<LlmLibraryProviderGroup[]>(() => {
        const query = this.searchQuery().toLowerCase();
        const cap = this.selectedCapability() as string;

        return this.providerGroups()
            .map((group) => {
                const filteredModels = group.models.filter((model) => {
                    const matchesSearch =
                        !query ||
                        model.customName.toLowerCase().includes(query) ||
                        model.modelName.toLowerCase().includes(query) ||
                        group.providerName.toLowerCase().includes(query);

                    const matchesCap = cap === null || model.tags.some((t) => t.name.includes(cap));

                    return matchesSearch && matchesCap;
                });

                return { ...group, models: filteredModels };
            })
            .filter((group) => group.models.length > 0);
    });

    groupedByType = computed(() => {
        const all = this.filteredGroups();
        return this.configTypeSections
            .map((section) => ({
                ...section,
                groups: all
                    .filter((g) => g.configType === section.type)
                    .sort((a, b) => a.providerName.localeCompare(b.providerName)),
            }))
            .filter((section) => section.groups.length > 0);
    });

    public capabilities = computed<SelectItem[]>(() => [
        { name: 'All Capabilities', value: null },
        ...this.configs().flatMap((config) => config.tags.map((tag) => ({ name: tag.name, value: tag.name }))),
    ]);

    ngOnInit() {
        this.llmLibraryService
            .loadConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.configsLoaded.set(true));

        this.openaiRealtimeStorage.getAllConfigs().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        this.elevenLabsRealtimeStorage.getAllConfigs().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        this.geminiRealtimeStorage.getAllConfigs().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    // ── OpenAI Realtime ──────────────────────────────────────────────────────

    onAddOpenAIRealtime(): void {
        this.dialog.open(OpenAIRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config: null, action: 'create' },
        });
    }

    onEditOpenAIRealtime(config: OpenAIRealtimeConfig): void {
        this.dialog.open(OpenAIRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config, action: 'update' },
        });
    }

    onDeleteOpenAIRealtime(config: OpenAIRealtimeConfig): void {
        this.confirmationDialogService
            .confirmDelete(config.custom_name)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result !== true) return;
                this.openaiRealtimeStorage.deleteConfig(config.id).subscribe({
                    next: () => this.toast.success('OpenAI Realtime config deleted.'),
                    error: () => this.toast.error('Failed to delete config.'),
                });
            });
    }

    // ── ElevenLabs Realtime ──────────────────────────────────────────────────

    onAddElevenLabsRealtime(): void {
        this.dialog.open(ElevenLabsRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config: null, action: 'create' },
        });
    }

    onEditElevenLabsRealtime(config: ElevenLabsRealtimeConfig): void {
        this.dialog.open(ElevenLabsRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config, action: 'update' },
        });
    }

    onDeleteElevenLabsRealtime(config: ElevenLabsRealtimeConfig): void {
        this.confirmationDialogService
            .confirmDelete(config.custom_name)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result !== true) return;
                this.elevenLabsRealtimeStorage.deleteConfig(config.id).subscribe({
                    next: () => this.toast.success('ElevenLabs Realtime config deleted.'),
                    error: () => this.toast.error('Failed to delete config.'),
                });
            });
    }

    // ── Gemini Realtime ──────────────────────────────────────────────────────

    onAddGeminiRealtime(): void {
        this.dialog.open(GeminiRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config: null, action: 'create' },
        });
    }

    onEditGeminiRealtime(config: GeminiRealtimeConfig): void {
        this.dialog.open(GeminiRealtimeConfigDialogComponent, {
            disableClose: true,
            data: { config, action: 'update' },
        });
    }

    onDeleteGeminiRealtime(config: GeminiRealtimeConfig): void {
        this.confirmationDialogService
            .confirmDelete(config.custom_name)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result !== true) return;
                this.geminiRealtimeStorage.deleteConfig(config.id).subscribe({
                    next: () => this.toast.success('Gemini Realtime config deleted.'),
                    error: () => this.toast.error('Failed to delete config.'),
                });
            });
    }

    public onSearchChange(value: string): void {
        this.searchQuery.set(value);
    }

    public onAddModel(): void {
        this.dialog.open(LlmModelConfigDialogComponent, {
            height: '90vh',
            width: '600px',
        });
    }

    public onEdit(model: LlmLibraryModel): void {
        const dialogComponents: Record<ModelTypes, ComponentType<unknown>> = {
            [ModelTypes.LLM]: LlmModelConfigDialogComponent,
            [ModelTypes.EMBEDDING]: EmbeddingModelConfigDialogComponent,
            [ModelTypes.REALTIME]: VoiceModelConfigDialogComponent,
            [ModelTypes.TRANSCRIPTION]: TranscriptionModelConfigDialogComponent,
        };
        this.dialog.open(dialogComponents[model.configType], {
            height: '90vh',
            width: '600px',
            data: { configId: model.id },
        });
    }

    public onDelete(model: LlmLibraryModel): void {
        const opts: ConfirmationDialogData = {
            title: 'Delete the model?',
            message: `Are you sure you want to delete the ${model.customName} model? This will delete it in all agents, tools and flows.`,
            type: 'danger',
        };

        this.confirmationDialogService
            .confirm(opts)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result !== true) return;

                const delete$: Record<ModelTypes, () => Observable<void>> = {
                    [ModelTypes.LLM]: () => this.llmConfigStorageService.deleteConfig(model.id),
                    [ModelTypes.EMBEDDING]: () => this.embeddingConfigStorage.deleteConfig(model.id),
                    [ModelTypes.REALTIME]: () => this.realtimeConfigStorage.deleteConfig(model.id),
                    [ModelTypes.TRANSCRIPTION]: () => this.transcriptionConfigStorage.deleteConfig(model.id),
                };

                delete$[model.configType]().subscribe({
                    next: () => {
                        this.toast.success('Configuration deleted.');
                        this.defaultModelsStorageService.markDefaultModelsOutdated();
                    },
                });
            });
    }
}
