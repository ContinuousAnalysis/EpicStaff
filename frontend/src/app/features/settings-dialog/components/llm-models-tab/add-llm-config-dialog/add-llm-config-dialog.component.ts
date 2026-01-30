import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
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
    private cdr = inject(ChangeDetectorRef);

    isLoading = signal(false);
    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);
    showApiKey = signal(false);

    providers = signal<LLM_Provider[]>([]);
    models = signal<LLM_Model[]>([]);

    selectedProvider = signal<LLM_Provider | null>(null);
    selectedModel = signal<LLM_Model | null>(null);
    selectedProviderId = signal<number | null>(null);
    selectedModelId = signal<number | null>(null);
    
    apiKey = signal('');
    customName = signal('');

    headerEntries = signal<HeaderEntry[]>([{ key: '', value: '' }]);
    headersJson = signal('{}');
    private isUpdatingHeadersFromUI = false;

    temperature = signal<number | null>(0.7);
    topP = signal<number | null>(1);
    presencePenalty = signal<number | null>(0);
    frequencyPenalty = signal<number | null>(0);

    maxTokens = signal<number | null>(4096);
    maxCompletionTokens = signal<number | null>(2048);
    nCompletions = signal<number | null>(1);
    timeout = signal<number | null>(30);

    seed = signal<number | null>(null);
    stopSequencesJson = signal('{"sequences": ["\\n\\n", "Human:", "AI:"]}');
    logitBiasJson = signal('{}');
    responseFormatJson = signal('{}');
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

    isFormValid = computed(() => {
        return (
            this.selectedProviderId() !== null &&
            this.selectedModelId() !== null &&
            this.apiKey().trim() !== '' &&
            this.customName().trim() !== ''
        );
    });

    getProviderIcon = getProviderIconPath;

    constructor() {
        effect(() => {
            const provider = this.selectedProvider();
            const model = this.selectedModel();

            if (!this.isEditMode() && provider && model && !this.customName()) {
                this.customName.set(`${provider.name}/${model.name}`);
            }
        });

        effect(() => {
            if (this.isUpdatingHeadersFromUI) {
                return;
            }
            
            const jsonStr = this.headersJson();
            try {
                const headersObj = JSON.parse(jsonStr || '{}');
                if (typeof headersObj === 'object' && headersObj !== null && !Array.isArray(headersObj)) {
                    const entries: HeaderEntry[] = Object.entries(headersObj)
                        .filter(([key]) => typeof key === 'string' && key.trim())
                        .map(([key, value]) => ({
                            key: String(key),
                            value: typeof value === 'string' ? String(value) : JSON.stringify(value),
                        }));
                    
                    const currentEntries = this.headerEntries();
                    let emptyCount = 0;
                    for (let i = currentEntries.length - 1; i >= 0; i--) {
                        if (!currentEntries[i].key.trim() && !currentEntries[i].value.trim()) {
                            emptyCount++;
                        } else {
                            break;
                        }
                    }
                    
                    const emptyEntriesToAdd = Math.max(1, emptyCount);
                    for (let i = 0; i < emptyEntriesToAdd; i++) {
                        entries.push({ key: '', value: '' });
                    }
                    
                    const entriesChanged = entries.length !== currentEntries.length ||
                        entries.some((entry, idx) => 
                            currentEntries[idx]?.key !== entry.key || 
                            currentEntries[idx]?.value !== entry.value
                        );
                    
                    if (entriesChanged) {
                        this.headerEntries.set(entries);
                    }
                }
            } catch {}
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
        this.isUpdatingHeadersFromUI = false;
        
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
        this.selectedModelId.set(config.model);

        if (config.stop) {
            this.stopSequencesJson.set(JSON.stringify({ sequences: config.stop }, null, 2));
        } else {
            this.stopSequencesJson.set('{"sequences": ["\\n\\n", "Human:", "AI:"]}');
        }
        
        if (config.logit_bias) {
            this.logitBiasJson.set(JSON.stringify(config.logit_bias, null, 2));
        } else {
            this.logitBiasJson.set('{}');
        }
        
        if (config.response_format) {
            this.responseFormatJson.set(JSON.stringify(config.response_format, null, 2));
        } else {
            this.responseFormatJson.set('{}');
        }
        
        // Force change detection, then set headers with micro-delay
        this.cdr.detectChanges();
        
        setTimeout(() => {
            if (config.headers) {
                this.headersJson.set(JSON.stringify(config.headers, null, 2));
            } else {
                this.headersJson.set('{}');
            }
            this.cdr.detectChanges();
        }, 0);
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
        this.isUpdatingHeadersFromUI = true;
        
        this.headerEntries.update(entries => {
            const updated = [...entries, { key: '', value: '' }];
            const headersObj: Record<string, string> = {};
            updated.forEach(entry => {
                if (entry.key.trim()) {
                    headersObj[entry.key] = entry.value;
                }
            });
            this.headersJson.set(JSON.stringify(headersObj, null, 2));
            
            return updated;
        });
        
        // Reset flag after the update
        setTimeout(() => {
            this.isUpdatingHeadersFromUI = false;
        }, 0);
    }

    removeHeaderEntry(index: number): void {
        this.isUpdatingHeadersFromUI = true;
        
        this.headerEntries.update(entries => {
            const updated = entries.filter((_, i) => i !== index);
            
            if (updated.length === 0 || updated.every(e => e.key.trim())) {
                updated.push({ key: '', value: '' });
            }
            
            const headersObj: Record<string, string> = {};
            updated.forEach(entry => {
                if (entry.key.trim()) {
                    headersObj[entry.key] = entry.value;
                }
            });
            this.headersJson.set(JSON.stringify(headersObj, null, 2));
            
            return updated;
        });
        
        // Reset flag after the update
        setTimeout(() => {
            this.isUpdatingHeadersFromUI = false;
        }, 0);
    }

    updateHeaderEntry(index: number, field: 'key' | 'value', value: string): void {
        this.isUpdatingHeadersFromUI = true;
        
        this.headerEntries.update(entries => {
            const updated = [...entries];
            updated[index] = { ...updated[index], [field]: value };
            const headersObj: Record<string, string> = {};
            updated.forEach(entry => {
                if (entry.key.trim()) {
                    headersObj[entry.key] = entry.value;
                }
            });
            this.headersJson.set(JSON.stringify(headersObj, null, 2));
            
            return updated;
        });
        
        // Reset flag after the update
        setTimeout(() => {
            this.isUpdatingHeadersFromUI = false;
        }, 0);
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

    onHeadersChange(json: string): void {
        this.headersJson.set(json);
    }

    onSubmit(): void {
        if (!this.isFormValid()) return;

        this.isSubmitting.set(true);
        this.errorMessage.set(null);

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

        // Parse headers from JSON (source of truth)
        try {
            const headersObj = JSON.parse(this.headersJson() || '{}');
            if (typeof headersObj === 'object' && headersObj !== null && !Array.isArray(headersObj)) {
                const hasHeaders = Object.keys(headersObj).length > 0;
                if (hasHeaders) {
                    headers = headersObj as Record<string, string>;
                }
            }
        } catch {
            // Invalid JSON - headers will be undefined
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
            stop: stopSequences,
            logit_bias: logitBias,
            response_format: responseFormat,
            is_visible: true,
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
                next: () => {
                    this.dialogRef.close(true);
                },
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
