import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    Inject,
    OnInit,
    OnDestroy,
} from '@angular/core';
import {
    FormsModule,
    ReactiveFormsModule,
    FormControl,
    Validators,
} from '@angular/forms';
import { NgFor, NgIf } from '@angular/common';
import { MATERIAL_FORMS } from '../../../../shared/material-forms';

import { GetSourceCollectionRequest } from '../../../knowledge-sources/models/source-collection.model';

import { forkJoin, Subject, takeUntil } from 'rxjs';
import { LLM_Config_Service } from '../../../../features/settings-dialog/services/llms/LLM_config.service';
import { LLM_Models_Service } from '../../../../features/settings-dialog/services/llms/LLM_models.service';
import { CollectionsService } from '../../../knowledge-sources/services/source-collections.service';
import { KnowledgeSelectorComponent } from '../../../../shared/components/knowledge-selector/knowledge-selector.component';
import { IconButtonComponent } from '../../../../shared/components/buttons/icon-button/icon-button.component';
import {
    FullLLMConfig,
    FullLLMConfigService,
} from '../../../../features/settings-dialog/services/llms/full-llm-config.service';
import { LlmModelSelectorComponent } from '../../../../shared/components/llm-model-selector/llm-model-selector.component';

export interface AdvancedSettingsData {
    fullFcmLlmConfig?: FullLLMConfig;
    agentRole: string;
    max_iter: number;
    max_rpm: number | null;
    max_execution_time: number | null;
    max_retry_limit: number | null;
    default_temperature: number | null;
    knowledge_collection?: number | null;
    selected_knowledge_source?: GetSourceCollectionRequest | null; // For display purposes only
    similarity_threshold: string | null;
    search_limit: number | null;
    memory: boolean;
    cache: boolean;
    respect_context_window: boolean;
}

@Component({
    selector: 'app-advanced-settings-dialog',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        ...MATERIAL_FORMS,
        KnowledgeSelectorComponent,
        IconButtonComponent,
        LlmModelSelectorComponent,
    ],
    standalone: true,
    templateUrl: './advanced-settings-dialog.component.html',
    styleUrls: ['./advanced-settings-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvancedSettingsDialogComponent implements OnInit, OnDestroy {
    public agentData: AdvancedSettingsData;
    public combinedLLMs: FullLLMConfig[] = [];
    public selectedLlmId: number | null = null;
    public isLoadingLLMs = false;

    // Knowledge sources
    public allKnowledgeSources: GetSourceCollectionRequest[] = [];
    public isLoadingKnowledgeSources = false;
    public knowledgeSourcesError: string | null = null;

    private readonly _destroyed$ = new Subject<void>();
    public floatedThreshold: any;
    public search_limit: any;

    // Form controls for sliders
    public maxIterControl = new FormControl(10, [
        Validators.min(1),
        Validators.max(30),
    ]);
    public maxRpmControl = new FormControl(10, [
        Validators.min(1),
        Validators.max(30),
    ]);
    public maxExecutionTimeControl = new FormControl(60, [
        Validators.min(1),
        Validators.max(300),
    ]);
    public maxRetryLimitControl = new FormControl(3, [
        Validators.min(0),
        Validators.max(10),
    ]);
    public searchLimitControl = new FormControl(10, [
        Validators.min(1),
        Validators.max(1000),
    ]);
    public similarityThresholdControl = new FormControl(0.7, [
        Validators.min(0.1),
        Validators.max(1.0),
    ]);
    public memoryControl = new FormControl(true);
    public cacheControl = new FormControl(true);
    public respectContextWindowControl = new FormControl(true);

    constructor(
        public dialogRef: DialogRef<AdvancedSettingsData>,
        @Inject(DIALOG_DATA) public data: AdvancedSettingsData,
        private llmConfigService: LLM_Config_Service,
        private llmModelsService: LLM_Models_Service,
        private fullLLMConfigService: FullLLMConfigService,
        private collectionsService: CollectionsService,
        private cdr: ChangeDetectorRef
    ) {
        // Initialize your local data from the injected data
        this.agentData = { ...data };

        // Initialize form controls with data
        this.maxIterControl.setValue(data.max_iter || 10);
        this.maxRpmControl.setValue(data.max_rpm || 10);
        this.maxExecutionTimeControl.setValue(data.max_execution_time || 60);
        this.maxRetryLimitControl.setValue(data.max_retry_limit ?? 3);
        this.searchLimitControl.setValue(data.search_limit || 10);

        if (data.similarity_threshold !== null) {
            this.floatedThreshold = parseFloat(data.similarity_threshold);
            this.similarityThresholdControl.setValue(
                parseFloat(data.similarity_threshold)
            );
        } else {
            this.floatedThreshold = 0.7;
            this.similarityThresholdControl.setValue(0.7);
        }
        this.search_limit =
            this.agentData.search_limit !== null
                ? this.agentData.search_limit
                : 10;

        // Set default_temperature to null as requested
        this.agentData.default_temperature = null;

        // Initialize boolean controls with data or defaults
        this.memoryControl.setValue(data.memory ?? true);
        this.cacheControl.setValue(data.cache ?? true);
        this.respectContextWindowControl.setValue(
            data.respect_context_window ?? true
        );

        // Initialize selected LLM ID from fullFcmLlmConfig if present
        if (this.agentData.fullFcmLlmConfig) {
            this.selectedLlmId = this.agentData.fullFcmLlmConfig.id;
        } else {
            this.selectedLlmId = null; // "Same as LLM" option
        }

        // Log the value of knowledge_collection specifically
        console.log(
            'Constructor - knowledge_collection value:',
            this.agentData.knowledge_collection
        );
    }

    // In ngOnInit
    public ngOnInit(): void {
        console.log('ngOnInit - Starting initialization');
        // Fetch LLM configs, models, and knowledge sources
        this.isLoadingKnowledgeSources = true;
        this.isLoadingLLMs = true;

        forkJoin({
            llmConfigs: this.fullLLMConfigService.getFullLLMConfigs(),
            knowledgeSources:
                this.collectionsService.getGetSourceCollectionRequests(),
        })
            .pipe(takeUntil(this._destroyed$))
            .subscribe({
                next: ({ llmConfigs, knowledgeSources }) => {
                    console.log(
                        'API response - Knowledge sources:',
                        knowledgeSources
                    );

                    // Process LLM configs
                    this.combinedLLMs = llmConfigs;

                    // Make sure the selected LLM ID is set correctly
                    if (this.agentData.fullFcmLlmConfig) {
                        console.log(
                            'Setting selected LLM ID from fullFcmLlmConfig:',
                            this.agentData.fullFcmLlmConfig
                        );

                        // Find the matching LLM config in our loaded configs
                        const matchingConfig = llmConfigs.find(
                            (config) =>
                                config.id ===
                                this.agentData.fullFcmLlmConfig?.id
                        );

                        if (matchingConfig) {
                            console.log(
                                'Found matching LLM config:',
                                matchingConfig
                            );
                            this.selectedLlmId = matchingConfig.id;
                            // Force UI update with setTimeout
                            setTimeout(() => {
                                this.selectedLlmId = matchingConfig.id;
                                this.cdr.markForCheck();
                            });
                        } else {
                            console.log('No matching LLM config found');
                        }
                    }

                    // Process knowledge sources
                    this.allKnowledgeSources = knowledgeSources;
                    console.log(
                        'Loaded knowledge sources count:',
                        this.allKnowledgeSources.length
                    );

                    // Set selected knowledge source based on the ID
                    if (this.agentData.knowledge_collection) {
                        console.log(
                            'Attempting to find knowledge source with ID:',
                            this.agentData.knowledge_collection
                        );

                        const foundSource = this.allKnowledgeSources.find(
                            (source) =>
                                source.collection_id ===
                                this.agentData.knowledge_collection
                        );

                        console.log('Found source:', foundSource);

                        this.agentData.selected_knowledge_source =
                            foundSource || null;

                        console.log(
                            'Selected knowledge source after initialization:',
                            this.agentData.selected_knowledge_source
                                ? `${this.agentData.selected_knowledge_source.collection_name} (ID: ${this.agentData.selected_knowledge_source.collection_id})`
                                : 'None'
                        );
                    } else {
                        console.log(
                            'No knowledge_collection ID provided in initial data'
                        );
                    }

                    this.isLoadingKnowledgeSources = false;
                    this.isLoadingLLMs = false;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    console.error('Error fetching data:', err);
                    this.knowledgeSourcesError =
                        'Failed to load knowledge sources';
                    this.isLoadingKnowledgeSources = false;
                    this.isLoadingLLMs = false;
                    this.cdr.markForCheck();
                },
            });
    }

    public onLlmChange(llmId: number | null): void {
        console.log('LLM changed to:', llmId);
        this.selectedLlmId = llmId;

        if (llmId === null) {
            // "Default to LLM" option selected
            this.agentData.fullFcmLlmConfig = undefined;
        } else {
            // Find the selected LLM config
            const selectedLlm = this.combinedLLMs.find(
                (llm) => llm.id === llmId
            );
            if (selectedLlm) {
                this.agentData.fullFcmLlmConfig = selectedLlm;
                console.log(
                    'Selected LLM config:',
                    this.agentData.fullFcmLlmConfig
                );
            }
        }
        this.cdr.markForCheck();
    }

    public onKnowledgeSourceChange(collectionId: number | null): void {
        console.log('Knowledge source changed to:', collectionId);
        this.agentData.knowledge_collection = collectionId;

        if (collectionId === null) {
            this.agentData.selected_knowledge_source = null;
        } else {
            const selectedCollection = this.allKnowledgeSources.find(
                (source) => source.collection_id === collectionId
            );
            this.agentData.selected_knowledge_source =
                selectedCollection || null;
        }
        this.cdr.markForCheck();
    }

    public onThresholdChange(event: any): void {
        const value = event.value;
        this.agentData.similarity_threshold = JSON.stringify(value);
    }

    public onSearchLimitChange(event: any): void {
        const value = event.value;
        this.agentData.search_limit = value ?? null;
    }

    // Formatting methods for sliders
    formatIterationLabel(value: number): string {
        return `${value}`;
    }

    formatExecutionTimeLabel(value: number): string {
        return `${value}s`;
    }

    formatRetryLimitLabel(value: number): string {
        return `${value}`;
    }

    formatRpmLabel(value: number): string {
        return `${value}`;
    }

    formatSearchLimitLabel(value: number): string {
        return `${value}`;
    }

    formatThresholdLabel(value: number): string {
        return `${value}`;
    }

    // In save method
    public save(): void {
        // Update agentData with current form control values
        this.agentData.max_iter = this.maxIterControl.value || 10;
        this.agentData.max_rpm = this.maxRpmControl.value || 10;
        this.agentData.max_execution_time =
            this.maxExecutionTimeControl.value || 60;
        this.agentData.max_retry_limit = this.maxRetryLimitControl.value ?? 3;
        this.agentData.search_limit = this.searchLimitControl.value || 10;
        this.agentData.similarity_threshold =
            this.similarityThresholdControl.value?.toString() || '0.7';
        this.agentData.memory = this.memoryControl.value ?? true;
        this.agentData.cache = this.cacheControl.value ?? true;
        this.agentData.respect_context_window =
            this.respectContextWindowControl.value ?? true;

        console.log(
            'save called - Final agentData:',
            JSON.stringify(this.agentData)
        );
        console.log(
            'knowledge_collection value before dialog close:',
            this.agentData.knowledge_collection
        );

        // Create a deep copy to prevent any unintended references
        const result = JSON.parse(JSON.stringify(this.agentData));

        console.log('Final data being returned:', JSON.stringify(result));
        this.dialogRef.close(result);
    }

    public ngOnDestroy(): void {
        this._destroyed$.next();
        this._destroyed$.complete();
    }
}
