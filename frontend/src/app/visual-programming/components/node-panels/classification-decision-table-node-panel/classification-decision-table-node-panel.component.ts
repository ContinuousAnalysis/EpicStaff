import {
    ChangeDetectionStrategy,
    Component,
    input,
    ChangeDetectorRef,
    signal,
    computed,
    inject,
    effect,
    DestroyRef,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormArray, Validators, FormBuilder } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClassificationDecisionTableNodeModel } from '../../../core/models/node.model';
import { BaseSidePanel } from '../../../core/models/node-panel.abstract';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { CommonModule } from '@angular/common';
import { ClassificationDecisionTableData, PromptConfig, ComputationConfig } from '../../../core/models/classification-decision-table.model';
import { ClassificationDecisionTableGridComponent } from './classification-decision-table-grid/classification-decision-table-grid.component';
import { FlowService } from '../../../services/flow.service';
import { NodeType } from '../../../core/enums/node-type';
import { ConditionGroup } from '../../../core/models/decision-table.model';
import { generatePortsForClassificationDecisionTableNode } from '../../../core/helpers/helpers';
import { FullLLMConfig, FullLLMConfigService } from '../../../../features/settings-dialog/services/llms/full-llm-config.service';
import { LlmModelSelectorComponent } from '../../../../shared/components/llm-model-selector/llm-model-selector.component';
import { FormsModule } from '@angular/forms';
import { TabButtonComponent } from '../../../../shared/components/tab-button/tab-button.component';
import { InputMapComponent } from '../../input-map/input-map.component';
import { CodeEditorComponent } from '../../../../user-settings-page/tools/custom-tool-editor/code-editor/code-editor.component';
import { SidePanelService } from '../../../services/side-panel.service';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

type TabType = 'table' | 'precomputation' | 'postcomputation' | 'prompts';

@Component({
    standalone: true,
    selector: 'app-classification-decision-table-node-panel',
    imports: [
        ReactiveFormsModule,
        FormsModule,
        CustomInputComponent,
        CommonModule,
        ClassificationDecisionTableGridComponent,
        LlmModelSelectorComponent,
        TabButtonComponent,
        InputMapComponent,
        CodeEditorComponent,
    ],
    templateUrl: './classification-decision-table-node-panel.component.html',
    styleUrls: ['./classification-decision-table-node-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationDecisionTableNodePanelComponent extends BaseSidePanel<ClassificationDecisionTableNodeModel> {
    public readonly isExpanded = input<boolean>(true);

    private flowService = inject(FlowService);
    private cdr = inject(ChangeDetectorRef);
    private fullLlmConfigService = inject(FullLLMConfigService);
    private destroyRef = inject(DestroyRef);

    public activeTab = signal<TabType>('table');
    public conditionGroups = signal<ConditionGroup[]>([]);
    public prompts = signal<Record<string, PromptConfig>>({});
    public llmConfigs: FullLLMConfig[] = [];
    public editingPromptId = signal<string | null>(null);
    public newPromptId = '';

    public preCode: string = '';
    public postCode: string = '';
    private readonly codeChange$ = new Subject<void>();
    private sidePanelService = inject(SidePanelService);

    public promptEntries = computed(() => {
        const p = this.prompts();
        return Object.entries(p).map(([id, config]) => ({ id, ...config }));
    });

    public get llmConfigOptions(): { id: number; label: string }[] {
        return this.llmConfigs.map(c => ({
            id: c.id,
            label: c.custom_name || `LLM #${c.id}`,
        }));
    }

    constructor() {
        super();
        this.codeChange$
            .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.sidePanelService.triggerAutosave());
        this.fullLlmConfigService
            .getFullLLMConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (configs) => {
                    this.llmConfigs = configs;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.llmConfigs = [];
                    this.cdr.markForCheck();
                },
            });
    }

    public availableNodes = computed(() => {
        const nodes = this.flowService.nodes();
        const currentNodeId = this.node().id;

        return nodes
            .filter((node) =>
                node.type !== NodeType.NOTE &&
                node.type !== NodeType.START &&
                node.type !== NodeType.WEBHOOK_TRIGGER &&
                node.type !== NodeType.TELEGRAM_TRIGGER &&
                node.id !== currentNodeId
            )
            .map((node) => ({
                value: node.id,
                label: node.node_name || node.id,
            }));
    });

    get activeColor(): string {
        return this.node().color || '#685fff';
    }

    protected initializeForm(): FormGroup {
        const node = this.node();
        const tableData = (node.data as any).table as ClassificationDecisionTableData;
        const nodes = this.flowService.nodes();
        const connections = this.flowService.connections();

        const findNodeId = (value: string | null, role: 'default' | 'error'): string => {
            if (value) {
                const foundNode = nodes.find(n => n.id === value || n.node_name === value);
                if (foundNode) {
                    return foundNode.id;
                }
            }

            const portSuffix = role === 'default' ? 'decision-default' : 'decision-error';
            const portId = `${node.id}_${portSuffix}`;

            const connection = connections.find(
                c => c.sourceNodeId === node.id && c.sourcePortId === portId
            );

            if (connection) {
                return connection.targetNodeId;
            }

            return value || '';
        };

        const defaultNext = findNodeId(tableData.default_next_node, 'default');
        const errorNext = findNodeId(tableData.next_error_node, 'error');

        const preComp = tableData.pre_computation || { code: tableData.pre_computation_code || this.getDefaultPreComputation(), input_map: {} };
        const postComp = tableData.post_computation || { code: tableData.post_computation_code || '', input_map: {} };

        this.preCode = preComp.code || '';
        this.postCode = postComp.code || '';

        const form = this.fb.group({
            node_name: [node.node_name, this.createNodeNameValidators()],
            pre_computation_code: [this.preCode],
            pre_input_map: this.fb.array([] as FormGroup[]),
            pre_output_variable_path: [preComp.output_variable_path || ''],
            post_computation_code: [this.postCode],
            post_input_map: this.fb.array([] as FormGroup[]),
            post_output_variable_path: [postComp.output_variable_path || ''],
            route_variable_name: [tableData.route_variable_name || 'route_code'],
            default_next_node: [defaultNext],
            next_error_node: [errorNext],
            default_llm_id: [tableData.default_llm_id || null],
        });

        this.initializeInputMapArray(form, 'pre_input_map', preComp.input_map || {});
        this.initializeInputMapArray(form, 'post_input_map', postComp.input_map || {});

        const groupsCopy = this.cloneConditionGroups(tableData.condition_groups || []);
        this.conditionGroups.set(groupsCopy);
        this.prompts.set({ ...(tableData.prompts || {}) });

        return form;
    }

    createUpdatedNode(): ClassificationDecisionTableNodeModel {
        const currentNode = this.node();
        const conditionGroups = this.cloneConditionGroups(this.conditionGroups() || []);

        const preInputMap = this.serializeInputMap('pre_input_map');
        const postInputMap = this.serializeInputMap('post_input_map');

        const tableData: ClassificationDecisionTableData = {
            pre_computation_code: this.preCode,
            post_computation_code: this.postCode,
            pre_computation: {
                code: this.preCode,
                input_map: preInputMap,
                output_variable_path: this.form.value.pre_output_variable_path || undefined,
            },
            post_computation: {
                code: this.postCode,
                input_map: postInputMap,
                output_variable_path: this.form.value.post_output_variable_path || undefined,
            },
            condition_groups: conditionGroups,
            route_variable_name: this.form.value.route_variable_name,
            default_next_node: this.form.value.default_next_node,
            next_error_node: this.form.value.next_error_node,
            default_llm_id: this.form.value.default_llm_id || null,
            prompts: { ...this.prompts() },
        };

        // Calculate node size based on unique route codes with dock_visible=true
        const uniqueRouteCodes = new Set<string>();
        conditionGroups
            .filter((g) => g.route_code && g.dock_visible)
            .forEach((g) => uniqueRouteCodes.add(g.route_code!));

        const headerHeight = 60;
        const rowHeight = 46;
        const routeCodeCount = uniqueRouteCodes.size;
        const hasDefaultRow = 1;
        const hasErrorRow = 1;
        const totalRows = Math.max(routeCodeCount + hasDefaultRow + hasErrorRow, 2);
        const calculatedHeight = headerHeight + rowHeight * totalRows;

        const updatedSize = {
            width: currentNode.size?.width || 330,
            height: Math.max(calculatedHeight, 152),
        };

        const updatedPorts = generatePortsForClassificationDecisionTableNode(
            currentNode.id,
            conditionGroups,
            !!tableData.default_next_node,
            !!tableData.next_error_node
        );

        return {
            ...currentNode,
            node_name: this.form.value.node_name,
            size: updatedSize,
            ports: updatedPorts,
            data: {
                name: this.form.value.node_name || 'Classification Decision Table',
                table: tableData,
            },
        };
    }

    public setActiveTab(tab: TabType): void {
        this.activeTab.set(tab);
    }

    public onConditionGroupsChange(groups: ConditionGroup[]): void {
        this.conditionGroups.set(this.cloneConditionGroups(groups));
        this.cdr.markForCheck();
    }

    // ── Prompt Library ──

    public addPrompt(): void {
        const id = this.newPromptId.trim();
        if (!id) return;
        const current = this.prompts();
        if (current[id]) return; // duplicate
        const defaultLlmId = this.form.value.default_llm_id;
        this.prompts.set({
            ...current,
            [id]: {
                prompt_text: '',
                llm_id: defaultLlmId ? String(defaultLlmId) : '',
                output_schema: '',
                result_variable: '',
            },
        });
        this.newPromptId = '';
        this.editingPromptId.set(id);
    }

    public onPromptAdd(id: string, config: PromptConfig): void {
        const current = this.prompts();
        if (current[id]) return; // duplicate
        this.prompts.set({ ...current, [id]: config });
    }

    public updatePrompt(id: string, field: keyof PromptConfig, value: any): void {
        const current = { ...this.prompts() };
        if (!current[id]) return;
        current[id] = { ...current[id], [field]: value };
        this.prompts.set(current);
    }

    public deletePrompt(id: string): void {
        const current = { ...this.prompts() };
        delete current[id];
        this.prompts.set(current);
        if (this.editingPromptId() === id) {
            this.editingPromptId.set(null);
        }
    }

    public toggleEditPrompt(id: string): void {
        this.editingPromptId.set(this.editingPromptId() === id ? null : id);
    }

    public onPromptLlmChange(promptId: string, llmId: number): void {
        this.updatePrompt(promptId, 'llm_id', String(llmId));
    }

    public getLlmIdAsNumber(llmId: string): number | null {
        const n = Number(llmId);
        return isNaN(n) || !llmId ? null : n;
    }

    public getSchemaString(schema: any): string {
        if (!schema || (typeof schema === 'object' && Object.keys(schema).length === 0)) {
            return '';
        }
        if (typeof schema === 'string') {
            return schema;
        }
        return JSON.stringify(schema, null, 2);
    }

    public onSchemaChange(promptId: string, value: string): void {
        try {
            const parsed = JSON.parse(value);
            this.updatePrompt(promptId, 'output_schema', parsed);
        } catch {
            // Store as string if not valid JSON yet (user still typing)
            this.updatePrompt(promptId, 'output_schema', value);
        }
    }

    // ── Code editor handlers ──

    public onPreCodeChange(code: string): void {
        this.preCode = code;
        this.codeChange$.next();
    }

    public onPostCodeChange(code: string): void {
        this.postCode = code;
        this.codeChange$.next();
    }

    // ── Input map helpers ──

    private initializeInputMapArray(form: FormGroup, arrayName: string, map: Record<string, string>): void {
        const arr = form.get(arrayName) as FormArray;
        const entries = Object.entries(map);
        if (entries.length > 0) {
            entries.forEach(([key, value]) => {
                arr.push(this.fb.group({
                    key: [key],
                    value: [value],
                }));
            });
        } else {
            arr.push(this.fb.group({
                key: [''],
                value: ['variables.'],
            }));
        }
    }

    private serializeInputMap(arrayName: string): Record<string, string> {
        const arr = this.form.get(arrayName) as FormArray;
        const result: Record<string, string> = {};
        arr.controls.forEach((ctrl) => {
            const pair = ctrl.value;
            if (pair.key?.trim()) {
                result[pair.key.trim()] = pair.value || '';
            }
        });
        return result;
    }

    private cloneConditionGroups(groups: ConditionGroup[]): ConditionGroup[] {
        return groups.map((group) => ({
            ...group,
            conditions: (group.conditions || []).map((condition) => ({
                ...condition,
            })),
        }));
    }

    private getDefaultTableData(): ClassificationDecisionTableData {
        return {
            pre_computation_code: this.getDefaultPreComputation(),
            condition_groups: [],
            prompts: {},
            output_variables: [],
            route_variable_name: 'route_code',
            default_next_node: null,
            next_error_node: null,
        };
    }

    private getDefaultPreComputation(): string {
        return `def main(arg1: str, arg2: str) -> dict:
    return {
        "result": arg1 + arg2,
    }
`;
    }
}
