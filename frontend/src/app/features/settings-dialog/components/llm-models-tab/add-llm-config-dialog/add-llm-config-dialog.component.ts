import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    inject,
    signal,
    computed,
    effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';
import { SelectComponent, SelectItem } from '../../../../../shared/components/select/select.component';
import { InputNumberComponent } from '../../../../../shared/components/app-input-number/input-number.component';
import { SliderWithStepperComponent } from '../../../../../shared/components/slider-with-stepper/slider-with-stepper.component';
import { NumberStepperComponent } from '../../../../../shared/components/number-stepper/number-stepper.component';
import { FormFieldLabelComponent } from '../../../../../shared/components/form-field-label/form-field-label.component';
import { JsonEditorComponent } from '../../../../../shared/components/json-editor/json-editor.component';
import { AppIconComponent } from '../../../../../shared/components/app-icon/app-icon.component';

import { LLM_Provider, ModelTypes } from '../../../models/LLM_provider.model';
import { LLM_Model } from '../../../models/llms/LLM.model';
import { CreateLLMConfigRequest, GetLlmConfigRequest } from '../../../models/llms/LLM_config.model';
import { LLM_Providers_Service } from '../../../services/LLM_providers.service';
import { LLM_Models_Service } from '../../../services/llms/LLM_models.service';
import { LLM_Config_Service } from '../../../services/llms/LLM_config.service';
import { ModelSelectorModalComponent, ModelSelectorResult } from '../model-selector-modal/model-selector-modal.component';
import { getProviderIconPath } from '../../../utils/get-provider-icon';

export interface AddLlmConfigDialogData {
    editConfig?: GetLlmConfigRequest;
}

interface HeaderEntry {
    key: string;
    value: string;
}

@Component({
    selector: 'app-add-llm-config-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonComponent,
        SelectComponent,
        InputNumberComponent,
        SliderWithStepperComponent,
        NumberStepperComponent,
        FormFieldLabelComponent,
        JsonEditorComponent,
        AppIconComponent,
    ],
    templateUrl: './add-llm-config-dialog.component.html',
    styleUrls: ['./add-llm-config-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddLlmConfigDialogComponent implements OnInit {
    private dialogRef = inject(DialogRef);
    private dialog = inject(Dialog);
    private dialogData = inject<AddLlmConfigDialogData | null>(DIALOG_DATA, { optional: true });
    private providersService = inject(LLM_Providers_Service);
    private modelsService = inject(LLM_Models_Service);
    private configService = inject(LLM_Config_Service);
    private destroyRef = inject(DestroyRef);

    // State signals
    isLoading = signal(false);
    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);
    showApiKey = signal(false);

    // Data signals
    providers = signal<LLM_Provider[]>([]);
    models = signal<LLM_Model[]>([]);

    // Selected provider/model
    selectedProvider = signal<LLM_Provider | null>(null);
    selectedModel = signal<LLM_Model | null>(null);

    // Form field signals - Model Information
    selectedProviderId = signal<number | null>(null);
    selectedModelId = signal<number | null>(null);
    apiKey = signal('');
    customName = signal('');
    selectedCapabilities = signal<string[]>([]);

    // Form field signals - API Configuration
    baseUrl = signal('');
    apiVersion = signal('');
    deployment = signal('');
    headerEntries = signal<HeaderEntry[]>([{ key: '', value: '' }]);
    headersJson = signal('{}');

    // Form field signals - Generation Parameters
    temperature = signal<number | null>(0.7);
    topP = signal<number | null>(1);
    presencePenalty = signal<number | null>(0);
    frequencyPenalty = signal<number | null>(0);

    // Form field signals - Token Limits & Completion
    maxTokens = signal<number | null>(4096);
    maxCompletionTokens = signal<number | null>(2048);
    nCompletions = signal<number | null>(1);
    timeout = signal<number | null>(30);

    // Form field signals - Advanced Parameters
    seed = signal<number | null>(null);
    topLogprobs = signal<number | null>(5);
    stopSequencesJson = signal('{"sequences": ["\\n\\n", "Human:", "AI:"]}');
    logitBiasJson = signal('{}');
    responseFormatJson = signal('{}');

    // Computed values
    isEditMode = computed(() => !!this.dialogData?.editConfig);

    dialogTitle = computed(() =>
        this.isEditMode() ? 'Edit LLM Configuration' : 'Add LLM Configuration'
    );

    submitButtonText = computed(() => {
        if (this.isSubmitting()) {
            return this.isEditMode() ? 'Saving...' : 'Adding...';
        }
        return this.isEditMode() ? 'Save' : 'Add LLM';
    });

    providerItems = computed<SelectItem[]>(() =>
        this.providers().map(p => ({ name: p.name, value: p.id }))
    );

    modelItems = computed<SelectItem[]>(() =>
        this.models().map(m => ({ name: m.name, value: m.id }))
    );

    capabilityItems = computed<SelectItem[]>(() => [
        { name: 'Chat', value: 'chat' },
        { name: 'Completion', value: 'completion' },
        { name: 'Embeddings', value: 'embeddings' },
        { name: 'Vision', value: 'vision' },
        { name: 'Function Calling', value: 'function_calling' },
    ]);

    isFormValid = computed(() => {
        return (
            this.selectedProviderId() !== null &&
            this.selectedModelId() !== null &&
            this.apiKey().trim() !== '' &&
            this.customName().trim() !== ''
        );
    });

    // Computed display value for selected provider/model
    selectedModelDisplay = computed(() => {
        const provider = this.selectedProvider();
        const model = this.selectedModel();
        if (provider && model) {
            return `${provider.name} / ${model.name}`;
        }
        return 'Select a model...';
    });

    getProviderIcon = getProviderIconPath;

    constructor() {
        // Effect to auto-generate custom name
        effect(() => {
            const provider = this.selectedProvider();
            const model = this.selectedModel();

            if (!this.isEditMode() && provider && model && !this.customName()) {
                this.customName.set(`${provider.name}/${model.name}`);
            }
        });

        // Effect to sync header entries with JSON
        effect(() => {
            const entries = this.headerEntries();
            const headersObj: Record<string, string> = {};
            entries.forEach(entry => {
                if (entry.key.trim()) {
                    headersObj[entry.key] = entry.value;
                }
            });
            this.headersJson.set(JSON.stringify(headersObj, null, 2));
        });
    }

    ngOnInit(): void {
        this.loadProvidersAndEditConfig();
    }

    openModelSelector(): void {
        const dialogRef = this.dialog.open(ModelSelectorModalComponent, {
            data: {
                selectedModelId: this.selectedModelId(),
            },
            disableClose: true,
        });

        dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
            if (result) {
                const { provider, model } = result as ModelSelectorResult;
                this.selectedProvider.set(provider);
                this.selectedModel.set(model);
                this.selectedProviderId.set(provider.id);
                this.selectedModelId.set(model.id);
            }
        });
    }

    private populateFormFromConfig(config: GetLlmConfigRequest): void {
        this.customName.set(config.custom_name);
        this.apiKey.set(config.api_key);
        this.temperature.set(config.temperature);
        this.topP.set(config.top_p);
        this.presencePenalty.set(config.presence_penalty);
        this.frequencyPenalty.set(config.frequency_penalty);
        this.maxTokens.set(config.max_tokens);
        this.maxCompletionTokens.set(config.max_completion_tokens);
        this.nCompletions.set(config.n);
        this.timeout.set(config.timeout);
        this.seed.set(config.seed);
        this.topLogprobs.set(config.top_logprobs);
        this.baseUrl.set(config.base_url ?? '');
        this.apiVersion.set(config.api_version ?? '');

        // Set the model ID - provider will be determined from model lookup
        this.selectedModelId.set(config.model);

        if (config.stop) {
            this.stopSequencesJson.set(JSON.stringify({ sequences: config.stop }, null, 2));
        }
        if (config.logit_bias) {
            this.logitBiasJson.set(JSON.stringify(config.logit_bias, null, 2));
        }
        if (config.response_format) {
            this.responseFormatJson.set(JSON.stringify(config.response_format, null, 2));
        }
        if (config.headers) {
            const entries = Object.entries(config.headers).map(([key, value]) => ({ key, value }));
            if (entries.length > 0) {
                this.headerEntries.set(entries);
            }
        }
        if (config.capabilities) {
            this.selectedCapabilities.set(config.capabilities);
        }
    }

    private loadProvidersAndEditConfig(): void {
        this.isLoading.set(true);
        this.providersService
            .getProvidersByQuery(ModelTypes.LLM)
            .pipe(
                finalize(() => this.isLoading.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: (providers) => {
                    this.providers.set(providers);

                    // Handle edit mode - populate form and load model's provider
                    if (this.dialogData?.editConfig) {
                        this.populateFormFromConfig(this.dialogData.editConfig);
                        this.loadEditConfigModelAndProvider(this.dialogData.editConfig.model, providers);
                    }
                },
                error: (error) => {
                    console.error('Error loading providers:', error);
                    this.errorMessage.set('Failed to load providers. Please try again.');
                },
            });
    }

    private loadEditConfigModelAndProvider(modelId: number, providers: LLM_Provider[]): void {
        this.modelsService
            .getLLMModelById(modelId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (model) => {
                    // Find the provider
                    const provider = providers.find(p => p.id === model.llm_provider);
                    if (provider) {
                        this.selectedProvider.set(provider);
                        this.selectedProviderId.set(provider.id);
                    }
                    this.selectedModel.set(model);
                    this.selectedModelId.set(model.id);
                },
                error: (error) => {
                    console.error('Error loading model:', error);
                },
            });
    }

    toggleApiKeyVisibility(): void {
        this.showApiKey.update(v => !v);
    }

    addHeaderEntry(): void {
        this.headerEntries.update(entries => [...entries, { key: '', value: '' }]);
    }

    removeHeaderEntry(index: number): void {
        this.headerEntries.update(entries => entries.filter((_, i) => i !== index));
    }

    updateHeaderEntry(index: number, field: 'key' | 'value', value: string): void {
        this.headerEntries.update(entries => {
            const updated = [...entries];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }

    onStopSequencesChange(json: string): void {
        this.stopSequencesJson.set(json);
    }

    onLogitBiasChange(json: string): void {
        this.logitBiasJson.set(json);
    }

    onResponseFormatChange(json: string): void {
        this.responseFormatJson.set(json);
    }

    onSubmit(): void {
        if (!this.isFormValid()) return;

        this.isSubmitting.set(true);
        this.errorMessage.set(null);

        // Parse JSON fields
        let stopSequences: string[] | null = null;
        let logitBias: Record<string, number> | null = null;
        let responseFormat: Record<string, unknown> | null = null;
        let headers: Record<string, string> | undefined;

        try {
            const stopData = JSON.parse(this.stopSequencesJson());
            stopSequences = stopData.sequences || null;
        } catch { /* ignore */ }

        try {
            logitBias = JSON.parse(this.logitBiasJson());
            if (Object.keys(logitBias || {}).length === 0) logitBias = null;
        } catch { /* ignore */ }

        try {
            responseFormat = JSON.parse(this.responseFormatJson());
            if (Object.keys(responseFormat || {}).length === 0) responseFormat = null;
        } catch { /* ignore */ }

        // Build headers from entries
        const headersObj: Record<string, string> = {};
        this.headerEntries().forEach(entry => {
            if (entry.key.trim()) {
                headersObj[entry.key] = entry.value;
            }
        });
        if (Object.keys(headersObj).length > 0) {
            headers = headersObj;
        }

        const configData: CreateLLMConfigRequest = {
            model: this.selectedModelId()!,
            custom_name: this.customName(),
            api_key: this.apiKey(),
            temperature: this.temperature(),
            top_p: this.topP(),
            presence_penalty: this.presencePenalty(),
            frequency_penalty: this.frequencyPenalty(),
            max_tokens: this.maxTokens(),
            max_completion_tokens: this.maxCompletionTokens(),
            n: this.nCompletions(),
            timeout: this.timeout(),
            seed: this.seed(),
            top_logprobs: this.topLogprobs(),
            stop: stopSequences,
            logit_bias: logitBias,
            response_format: responseFormat,
            base_url: this.baseUrl() || null,
            api_version: this.apiVersion() || null,
            is_visible: true,
            capabilities: this.selectedCapabilities().length > 0 ? this.selectedCapabilities() : undefined,
            headers,
        };

        const request$ = this.isEditMode()
            ? this.configService.updateConfig({
                ...configData,
                id: this.dialogData!.editConfig!.id,
            })
            : this.configService.createConfig(configData);

        request$
            .pipe(
                finalize(() => this.isSubmitting.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
                next: () => this.dialogRef.close(true),
                error: (error) => {
                    console.error('Error saving config:', error);
                    this.errorMessage.set('Failed to save configuration. Please try again.');
                },
            });
    }

    onCancel(): void {
        this.dialogRef.close(false);
    }
}
