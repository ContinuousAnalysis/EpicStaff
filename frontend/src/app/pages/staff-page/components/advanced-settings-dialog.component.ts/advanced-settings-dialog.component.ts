import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    Inject,
    OnInit,
    signal, inject, DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
    FormsModule,
    ReactiveFormsModule,
    Validators, FormGroup, FormBuilder,
} from '@angular/forms';
import { AgentRag, AgentSearchConfigs } from "@shared/models";

import { forkJoin, of } from 'rxjs';
import {
    AdvancedTabComponent,
    ExecutionTabComponent,
    GeneralTabComponent,
    IconButtonComponent, RagTabComponent,
    TabButtonComponent, Tab, TabId
} from '@shared/components';
import {
    FullLLMConfig,
    FullLLMConfigService,
} from '../../../../features/settings-dialog/services/llms/full-llm-config.service';
import { CollectionsApiService } from "../../../../features/knowledge-sources/services/collections-api.service";
import {
    GetCollectionRagsResponse,
    GetCollectionRequest
} from "../../../../features/knowledge-sources/models/collection.model";

export interface AdvancedSettingsData {
    id: number;
    role: string;
    max_iter: number;
    max_rpm: number | null;
    max_execution_time: number | null;
    max_retry_limit: number | null;
    default_temperature: number | null;
    knowledge_collection?: number | null;
    fcm_llm_config: number | null;
    rag: AgentRag | null
    search_configs: AgentSearchConfigs;
    memory: boolean;
    cache: boolean;
    respect_context_window: boolean;
}

@Component({
    selector: 'app-advanced-settings-dialog',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        IconButtonComponent,
        AdvancedTabComponent,
        ExecutionTabComponent,
        RagTabComponent,
        GeneralTabComponent,
        TabButtonComponent,
        GeneralTabComponent,
        RagTabComponent,
        ExecutionTabComponent,
        AdvancedTabComponent,

    ],
    standalone: true,
    templateUrl: './advanced-settings-dialog.component.html',
    styleUrls: ['./advanced-settings-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdvancedSettingsDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private destroyRef = inject(DestroyRef);

    activeTab = signal<TabId>(TabId.GENERAL);

    public combinedLLMs: FullLLMConfig[] = [];
    public form!: FormGroup;
    public allKnowledgeSources: GetCollectionRequest[] = [];
    public agentRags: GetCollectionRagsResponse[] = [];
    public tabs: Tab[] = [
        { id: TabId.GENERAL, label: 'General' },
        { id: TabId.RAG, label: 'RAG' },
        // { id: TabId.LLM_PARAMS, label: 'LLM Params' },
        { id: TabId.EXECUTION, label: 'Execution' },
        { id: TabId.ADVANCED, label: 'Advanced' },
    ];

    constructor(
        public dialogRef: DialogRef<AdvancedSettingsData>,
        @Inject(DIALOG_DATA) public data: AdvancedSettingsData,
        private fullLLMConfigService: FullLLMConfigService,
        private collectionsService: CollectionsApiService,
        private cdr: ChangeDetectorRef
    ) {}

    // In ngOnInit
    public ngOnInit(): void {
        this.initForm();

        // Fetch LLM configs, models, and knowledge sources
        const collectionId = this.data.knowledge_collection;
        forkJoin({
            llmConfigs: this.fullLLMConfigService.getFullLLMConfigs(),
            knowledgeSources:
                this.collectionsService.getCollections(),
            rags: collectionId ? this.collectionsService.getRagsByCollectionId(collectionId) : of([]),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ llmConfigs, knowledgeSources, rags }) => {
                    this.agentRags = rags;
                    this.combinedLLMs = llmConfigs;
                    this.allKnowledgeSources = knowledgeSources;

                    this.cdr.markForCheck();
                },
                error: (err) => {
                    console.error('Error fetching data:', err);
                    this.cdr.markForCheck();
                },
            });

        this.form.get('knowledge_collection')?.valueChanges
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(id => this.onKnowledgeSourceChange(id));
    }

    private initForm(): void {
        const data = this.data;
        this.form = this.fb.group({
            role: [data.role],
            max_iter: [data.max_iter || 10, [Validators.min(1), Validators.max(30)]],
            max_rpm: [data.max_rpm || 10, [Validators.min(1), Validators.max(30)]],
            max_execution_time: [data.max_execution_time || 60, [Validators.min(1), Validators.max(600)]],
            max_retry_limit: [data.max_retry_limit || 3, [Validators.min(0), Validators.max(10)]],
            cache: [data.cache ?? false],
            respect_context_window: [data.respect_context_window ?? false],
            fcm_llm_config: [data.fcm_llm_config || null],
            knowledge_collection: [data.knowledge_collection || null],
            rag: [{
                rag_id: data.rag?.rag_id || null,
                rag_type: data.rag?.rag_type || null,
            }],
            search_configs: [data.search_configs || null, [Validators.required]],
        });
    }

    private onKnowledgeSourceChange(collectionId: number | null): void {
        if (collectionId === null) {
            this.agentRags = [];
        } else {
            this.getRagsByCollectionId(collectionId);
        }
        this.form.get('rag')?.patchValue(null);
    }

    private getRagsByCollectionId(id: number): void {
        this.collectionsService.getRagsByCollectionId(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(rags => this.agentRags = rags);
    }

    // In save method
    public save(): void {
        if (this.form.invalid) return;

        const { search_configs, rag, ...rest } = this.form.value;
        const result = {
            ...rest,
            rag,
            search_configs: rag?.rag_type
                ? { [rag.rag_type]: search_configs }
                : null,
        };

        // Update agentData with current form control values
        this.dialogRef.close(result);
    }

    protected readonly TabId = TabId;
}
