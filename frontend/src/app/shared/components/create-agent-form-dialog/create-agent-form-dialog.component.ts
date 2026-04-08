import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import {
    AdvancedTabComponent,
    ButtonComponent,
    CustomInputComponent,
    ExecutionTabComponent,
    GeneralTabComponent,
    RagTabComponent,
    TabButtonComponent,
    TextareaComponent,
} from '@shared/components';
import { buildToolIdsArray } from '@shared/utils';

import {
    GetCollectionRagsResponse,
    GetCollectionRequest,
} from '../../../features/knowledge-sources/models/collection.model';
import { CollectionsApiService } from '../../../features/knowledge-sources/services/collections-api.service';
import {
    FullLLMConfig,
    FullLLMConfigService,
} from '../../../features/settings-dialog/services/llms/full-llm-config.service';
import { getProviderIconPath } from '../../../features/settings-dialog/utils/get-provider-icon';
import { CreateAgentRequest, GetAgentRequest, ToolUniqueName } from '../../../features/staff/models/agent.model';
import { CustomErrorStateMatcher } from '../../error-state-matcher';
import { MATERIAL_FORMS } from '../../material-forms';
import { AppSvgIconComponent } from '../app-svg-icon/app-svg-icon.component';
import { ValidationErrorsComponent } from '../app-validation-errors/validation-errors.component';
import { Tab, TabId } from './tabs';

export type AgentDialogResult =
    | { kind: 'create'; payload: CreateAgentRequest }
    | { kind: 'update'; payload: GetAgentRequest };

@Component({
    selector: 'app-create-agent-form',
    templateUrl: './create-agent-form-dialog.component.html',
    styleUrls: ['./create-agent-form-dialog.component.scss'],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ...MATERIAL_FORMS,
        AppSvgIconComponent,
        ValidationErrorsComponent,
        CustomInputComponent,
        TextareaComponent,
        AdvancedTabComponent,
        ExecutionTabComponent,
        GeneralTabComponent,
        RagTabComponent,
        TabButtonComponent,
        ButtonComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: ErrorStateMatcher,
            useClass: CustomErrorStateMatcher,
        },
    ],
})
export class CreateAgentFormComponent implements OnInit {
    private destroyRef = inject(DestroyRef);
    private fb = inject(FormBuilder);
    private cdr = inject(ChangeDetectorRef);
    private fullLLMConfigService = inject(FullLLMConfigService);
    private collectionsService = inject(CollectionsApiService);
    public dialogRef = inject(DialogRef<AgentDialogResult | undefined>);

    public isSubmitting = signal(false);
    public activeTab = signal<TabId>(TabId.GENERAL);

    public agentForm!: FormGroup;

    // Edit mode properties
    public isEditMode: boolean = false;
    public agentToEdit?: GetAgentRequest;

    // LLM configurations
    public llmConfigs: FullLLMConfig[] = [];

    // Knowledge sources
    public allKnowledgeSources: GetCollectionRequest[] = [];
    public agentRags: GetCollectionRagsResponse[] = [];
    public isLoadingKnowledgeSources = false;

    public tabs: Tab[] = [
        { id: TabId.GENERAL, label: 'General' },
        { id: TabId.RAG, label: 'RAG' },
        // { id: TabId.LLM_PARAMS, label: 'LLM Params' },
        { id: TabId.EXECUTION, label: 'Execution' },
        { id: TabId.ADVANCED, label: 'Advanced' },
    ];

    constructor() {
        // Check edit mode
        const data = this.dialogRef.config?.data as { agent: GetAgentRequest; isEditMode: boolean } | undefined;
        if (data?.isEditMode && data?.agent) {
            this.isEditMode = true;
            this.agentToEdit = data.agent;
        }
    }

    public ngOnInit(): void {
        this.initializeForm();
        this.loadLLMConfigs();
        this.loadKnowledgeSources();

        this.agentForm
            .get('knowledge_collection')
            ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((id) => this.onKnowledgeSourceChange(id));
    }

    private onKnowledgeSourceChange(collectionId: number | null): void {
        if (collectionId === null) {
            this.agentRags = [];
        } else {
            this.getRagsByCollectionId(collectionId);
        }
        this.agentForm.get('rag')?.patchValue(null);
    }

    private getRagsByCollectionId(id: number): void {
        this.collectionsService
            .getRagsByCollectionId(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((rags) => (this.agentRags = rags));
    }

    private initializeForm(): void {
        const agent = this.agentToEdit;
        const editMode = this.isEditMode;

        this.agentForm = this.fb.group({
            role: [editMode ? agent?.role : '', [Validators.required]],
            goal: [editMode ? agent?.goal : '', [Validators.required]],
            backstory: [editMode ? agent?.backstory : '', [Validators.required]],
            llm_config: [editMode ? agent?.llm_config : null],
            fcm_llm_config: [editMode ? agent?.fcm_llm_config : null],

            max_iter: [editMode ? agent?.max_iter : 10, [Validators.min(1), Validators.max(30)]],
            max_rpm: [editMode ? agent?.max_rpm : 10, [Validators.min(1), Validators.max(30)]],
            max_execution_time: [editMode ? agent?.max_execution_time : 60, [Validators.min(1), Validators.max(600)]],
            max_retry_limit: [editMode ? agent?.max_retry_limit : 3, [Validators.min(0), Validators.max(10)]],
            cache: [editMode ? agent?.cache : false],
            respect_context_window: [editMode ? agent?.respect_context_window : false],
            knowledge_collection: [editMode ? agent?.knowledge_collection : null],

            rag: [
                editMode
                    ? {
                          rag_id: agent?.rag?.rag_id || null,
                          rag_type: agent?.rag?.rag_type || null,
                      }
                    : null,
            ],
            search_configs: [editMode ? agent?.search_configs : null],

            allow_delegation: [editMode ? agent?.allow_delegation : true],
            memory: [editMode ? agent?.memory : false],
            configured_tools: [editMode ? agent?.configured_tools : []],
            python_code_tools: [editMode ? agent?.python_code_tools : []],
            mcp_tools: [editMode ? agent?.mcp_tools : []],
        });
    }

    private loadLLMConfigs(): void {
        this.fullLLMConfigService
            .getFullLLMConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((configs: FullLLMConfig[]) => {
                this.llmConfigs = configs;
                this.cdr.markForCheck();
            });
    }

    private loadKnowledgeSources(): void {
        this.isLoadingKnowledgeSources = true;
        this.collectionsService
            .getCollections()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (collections) => {
                    this.allKnowledgeSources = collections;
                    this.isLoadingKnowledgeSources = false;
                    this.cdr.markForCheck();
                },
                error: (error) => {
                    console.error('Error loading knowledge sources:', error);
                    this.isLoadingKnowledgeSources = false;
                    this.cdr.markForCheck();
                },
            });
    }

    // Helper method to get provider icon
    getProviderIcon(config: FullLLMConfig): string {
        if (!config || !config.providerDetails?.name) {
            return 'llm-providers-logos/default';
        }
        return getProviderIconPath(config.providerDetails.name);
    }

    public onSubmitForm(): void {
        if (this.agentForm.invalid) {
            this.agentForm.markAllAsTouched();
            return;
        }
        this.isSubmitting.set(true);

        const formData = this.agentForm.value;
        const configuredToolIds = formData.configured_tools ?? [];
        const pythonToolIds = formData.python_code_tools ?? [];
        const mcpToolIds = formData.mcp_tools ?? [];

        const toolIds = buildToolIdsArray(configuredToolIds, pythonToolIds, mcpToolIds) as ToolUniqueName[];

        const searchConfigs = formData.rag?.rag_type ? { [formData.rag.rag_type]: formData.search_configs } : null;

        const basePayload = {
            role: formData.role,
            goal: formData.goal,
            backstory: formData.backstory,
            allow_delegation: formData.allow_delegation,
            memory: formData.memory,
            max_iter: formData.max_iter,
            max_rpm: formData.max_rpm,
            max_execution_time: formData.max_execution_time,
            max_retry_limit: formData.max_retry_limit,
            default_temperature: formData.default_temperature,
            llm_config: formData.llm_config,
            fcm_llm_config: formData.fcm_llm_config,
            knowledge_collection: formData.knowledge_collection,
            rag: formData.rag,
            configured_tools: configuredToolIds,
            python_code_tools: pythonToolIds,
            mcp_tools: mcpToolIds,
            tool_ids: toolIds,
            cache: formData.cache,
            respect_context_window: formData.respect_context_window,
            search_configs: searchConfigs,
        };

        if (this.isEditMode && this.agentToEdit) {
            const updateRequest = {
                ...this.agentToEdit,
                ...basePayload,
            };

            // this.agentService
            //     .updateAgent({
            //         ...this.agentToEdit,
            //         ...basePayload,
            //     })
            //     .pipe(takeUntilDestroyed(this.destroyRef))
            //     .subscribe({
            //         next: (updatedAgent) => {
            //             const completeAgent: GetAgentRequest = {
            //                 ...this.agentToEdit!,
            //                 ...updatedAgent,
            //                 tools: this.agentToEdit!.tools,
            //             };
            //
            //             this.dialogRef.close(completeAgent);
            //         },
            //         error: (error) => {
            //             console.error('Error updating agent:', error);
            //             this.toastService.error('Failed to update agent');
            //         },
            //         complete: () => this.isSubmitting.set(false),
            //     });
            // todo
            this.dialogRef.close({ kind: 'update', payload: updateRequest });
        } else {
            // this.agentService
            //     .createAgent(basePayload)
            //     .pipe(takeUntilDestroyed(this.destroyRef))
            //     .subscribe({
            //         next: (createdAgent: GetAgentRequest) => {
            //             this.toastService.success(
            //                 `Agent ${createdAgent.role} created`
            //             );
            //             this.dialogRef.close(createdAgent);
            //         },
            //         error: (error) => {
            //             console.error('Error creating agent:', error);
            //             this.toastService.error('Failed to create agent');
            //         },
            //         complete: () => this.isSubmitting.set(false),
            //     });
            // todo
            this.dialogRef.close({ kind: 'create', payload: basePayload });
        }
    }

    public onCancelForm(): void {
        this.dialogRef.close();
    }

    protected readonly TabId = TabId;
}
