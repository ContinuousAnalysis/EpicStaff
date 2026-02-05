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
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, FormControl, Validators } from '@angular/forms';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';
import { SliderWithStepperComponent } from '../../../../../shared/components/slider-with-stepper/slider-with-stepper.component';
import { NumberStepperComponent } from '../../../../../shared/components/number-stepper/number-stepper.component';
import { JsonEditorComponent } from '../../../../../shared/components/json-editor/json-editor.component';
import { AppIconComponent } from '../../../../../shared/components/app-icon/app-icon.component';
import { HelpTooltipComponent } from '../../../../../shared/components/help-tooltip/help-tooltip.component';

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

@Component({
    selector: 'app-add-llm-config-dialog',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ButtonComponent,
        SliderWithStepperComponent,
        NumberStepperComponent,
        JsonEditorComponent,
        AppIconComponent,
        HelpTooltipComponent,
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
    private fb = inject(FormBuilder);

    form: FormGroup = this.fb.group({
        customName: ['', Validators.required],
        apiKey: ['', Validators.required],
        temperature: [0.7],
        topP: [1, [Validators.min(0.1)]],
        presencePenalty: [0],
        frequencyPenalty: [0],
        maxTokens: [4096, [Validators.required, Validators.min(1)]],
        maxCompletionTokens: [2048, [Validators.required, Validators.min(1)]],
        nCompletions: [1, [Validators.required, Validators.min(1)]],
        timeout: [30, [Validators.required, Validators.min(1)]],
        seed: [null as number | null, [Validators.min(-2147483648), Validators.max(2147483647)]],
        headers: this.fb.array([this.createHeaderGroup()]),
        stopSequences: this.fb.array([this.createStopSequenceControl()]),
    });

    isLoading = signal(false);
    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);
    showApiKey = signal(false);
    formValid = signal(false);

    providers = signal<LLM_Provider[]>([]);
    models = signal<LLM_Model[]>([]);

    selectedProvider = signal<LLM_Provider | null>(null);
    selectedModel = signal<LLM_Model | null>(null);
    selectedProviderId = signal<number | null>(null);
    selectedModelId = signal<number | null>(null);

    logitBias = signal<Record<string, number> | null>(null);
    responseFormat = signal<Record<string, unknown> | null>(null);
    headers = signal<Record<string, string>>({});
    private isUpdatingHeadersFromUI = false;

    logitBiasJson = computed(() => {
        const data = this.logitBias();
        return data ? JSON.stringify(data, null, 2) : '{}';
    });

    responseFormatJson = computed(() => {
        const data = this.responseFormat();
        return data ? JSON.stringify(data, null, 2) : '{}';
    });

    headersJson = computed(() => {
        const data = this.headers();
        return JSON.stringify(data, null, 2);
    });

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

    isFormValid = computed(() => {
        const valid = this.formValid();
        const hasProvider = this.selectedProviderId() !== null;
        const hasModel = this.selectedModelId() !== null;
        
        const finalResult = valid && hasProvider && hasModel;
        
        if (!finalResult) {
            console.log('[VALIDATION] Button DISABLED -', 
                !valid ? 'Form invalid' : '',
                !hasProvider ? 'No provider' : '',
                !hasModel ? 'No model' : ''
            );
        }
        
        return finalResult;
    });

    getProviderIcon = getProviderIconPath;

    get headersArray(): FormArray {
        return this.form.get('headers') as FormArray;
    }

    get stopSequencesArray(): FormArray {
        return this.form.get('stopSequences') as FormArray;
    }

    constructor() {
        effect(() => {
            const provider = this.selectedProvider();
            const model = this.selectedModel();

            if (!this.isEditMode() && provider && model && !this.form.get('customName')?.value) {
                console.log('[AUTO-SET] customName:', `${provider.name}/${model.name}`);
                this.form.patchValue({ customName: `${provider.name}/${model.name}` });
            }
        });

        this.subscribeToHeadersChanges();

        this.form.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.formValid.set(this.form.valid);
            });

        this.formValid.set(this.form.valid);
    }

    private createHeaderGroup(): FormGroup {
        return this.fb.group({
            key: [''],
            value: [''],
        });
    }

    private createStopSequenceControl(): FormControl {
        return this.fb.control('');
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
                console.log('[MODEL SELECTED]', provider.name, '/', model.name);
                
                this.selectedProvider.set(provider);
                this.selectedModel.set(model);
                this.selectedProviderId.set(provider.id);
                this.selectedModelId.set(model.id);
            } else if (result === null) {
                console.log('[MODEL DESELECTED]');
                this.selectedProvider.set(null);
                this.selectedModel.set(null);
                this.selectedProviderId.set(null);
                this.selectedModelId.set(null);
            }
        });
    }

    private populateFormFromConfig(config: GetLlmConfigRequest): void {
        console.log('[POPULATE] Headers from backend:', config.headers);
        console.log('[POPULATE] Stop sequences from backend:', config.stop);
        
        this.form.patchValue({
            customName: config.custom_name,
            apiKey: config.api_key,
            temperature: config.temperature,
            topP: config.top_p && config.top_p >= 0.1 ? config.top_p : 1,
            presencePenalty: config.presence_penalty,
            frequencyPenalty: config.frequency_penalty,
            maxTokens: config.max_tokens,
            maxCompletionTokens: config.max_completion_tokens,
            nCompletions: config.n,
            timeout: config.timeout,
            seed: config.seed !== null && config.seed >= -2147483648 && config.seed <= 2147483647 
                ? config.seed 
                : null,
        });

        this.selectedModelId.set(config.model);

        // Set JSON editor values
        this.logitBias.set(config.logit_bias || null);
        this.responseFormat.set(config.response_format || null);
        
        // Populate stop sequences array
        if (config.stop && config.stop.length > 0) {
            this.stopSequencesArray.clear();
            config.stop.forEach(seq => {
                this.stopSequencesArray.push(this.fb.control(seq));
            });
            this.stopSequencesArray.push(this.createStopSequenceControl());
        }
        
        // Rebuild headers form array
        const headersToSet = config.headers || {};
        this.isUpdatingHeadersFromUI = true;
        this.rebuildHeadersFormArray(headersToSet);
        this.headers.set(headersToSet);
        this.cdr.detectChanges();
        
        setTimeout(() => {
            this.isUpdatingHeadersFromUI = false;
        }, 200);
    }

    private rebuildHeadersFormArray(headersObj: Record<string, string>): void {
        const entries = Object.entries(headersObj);
        console.log('[REBUILD] Entries:', entries.length, '- keys:', entries.map(([k]) => k).join(', '));
        
        const controls: FormGroup[] = entries.map(([key, value]) => 
            this.fb.group({ key: [key], value: [value] })
        );
        
        controls.push(this.createHeaderGroup());
        
        const newArray = this.fb.array(controls);
        this.form.setControl('headers', newArray);
        
        this.subscribeToHeadersChanges();
        
        console.log('[REBUILD] New form array rows:', this.headersArray.length);
    }

    private subscribeToHeadersChanges(): void {
        this.headersArray.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                if (this.isUpdatingHeadersFromUI) {
                    return;
                }
                console.log('[VALUE CHANGES] Headers changed, syncing to JSON...');
                this.syncHeadersToJson();
            });
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
        console.log('[ADD] Adding header row');
        this.headersArray.push(this.createHeaderGroup());
    }

    removeHeaderEntry(index: number): void {
        console.log('[REMOVE] Removing row', index);
        this.headersArray.removeAt(index);
        
        if (this.headersArray.length === 0) {
            this.headersArray.push(this.createHeaderGroup());
        }
    }

    addStopSequence(): void {
        this.stopSequencesArray.push(this.createStopSequenceControl());
    }

    removeStopSequence(index: number): void {
        this.stopSequencesArray.removeAt(index);
        
        if (this.stopSequencesArray.length === 0) {
            this.stopSequencesArray.push(this.createStopSequenceControl());
        }
    }

    private syncHeadersToJson(): void {
        console.log('[SYNC] Form array length:', this.headersArray.length);
        
        const headersObj: Record<string, string> = {};
        this.headersArray.controls.forEach((control) => {
            const key = control.get('key')?.value?.trim();
            const value = control.get('value')?.value;
            
            if (key) {
                headersObj[key] = value || '';
            }
        });
        
        console.log('[SYNC] Final headers:', headersObj);
        this.headers.set(headersObj);
    }

    onLogitBiasChange(json: string): void {
        try {
            const parsed = JSON.parse(json || '{}');
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                const hasKeys = Object.keys(parsed).length > 0;
                this.logitBias.set(hasKeys ? parsed as Record<string, number> : null);
            } else {
                this.logitBias.set(null);
            }
        } catch {
        }
    }

    onResponseFormatChange(json: string): void {
        try {
            const parsed = JSON.parse(json || '{}');
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                const hasKeys = Object.keys(parsed).length > 0;
                this.responseFormat.set(hasKeys ? parsed as Record<string, unknown> : null);
            } else {
                this.responseFormat.set(null);
            }
        } catch {
        }
    }

    onHeadersChange(json: string): void {
        try {
            const parsed = JSON.parse(json || '{}');
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                this.headers.set(parsed as Record<string, string>);
            }
        } catch {
        }
    }

    onSubmit(): void {
        if (!this.isFormValid()) return;

        this.isSubmitting.set(true);
        this.errorMessage.set(null);

        const formValue = this.form.value;

        const stopSeqValues = formValue.stopSequences
            .map((val: string) => val?.trim())
            .filter((val: string) => val);
        const stopSequences = stopSeqValues.length > 0 ? stopSeqValues : null;
        console.log('[SAVE] stop sequences:', stopSequences);
        
        const logitBias = this.logitBias();
        const responseFormat = this.responseFormat();
        const headersObj = this.headers();
        const headers = Object.keys(headersObj).length > 0 ? headersObj : undefined;

        const seedValue = formValue.seed !== null && 
            formValue.seed >= -2147483648 && 
            formValue.seed <= 2147483647 
            ? formValue.seed 
            : null;

        const configData: CreateLLMConfigRequest = {
            model: this.selectedModelId()!,
            custom_name: formValue.customName,
            api_key: formValue.apiKey,
            temperature: formValue.temperature,
            top_p: formValue.topP,
            presence_penalty: formValue.presencePenalty,
            frequency_penalty: formValue.frequencyPenalty,
            max_tokens: formValue.maxTokens,
            max_completion_tokens: formValue.maxCompletionTokens,
            n: formValue.nCompletions,
            timeout: formValue.timeout,
            seed: seedValue,
            stop: stopSequences,
            logit_bias: logitBias,
            response_format: responseFormat,
            is_visible: true,
            headers,
        };
        
        console.log('[SAVE] Full configData:', JSON.stringify(configData, null, 2));

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
