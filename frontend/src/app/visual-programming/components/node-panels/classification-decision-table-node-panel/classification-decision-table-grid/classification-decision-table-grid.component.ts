import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
    signal,
    computed,
    ChangeDetectorRef,
    inject,
    OnInit,
    effect,
} from '@angular/core';
import { AgGridModule } from 'ag-grid-angular';
import {
    ColDef,
    GridApi,
    GridOptions,
    GridReadyEvent,
    CellValueChangedEvent,
    CellClickedEvent,
    ICellEditorParams,
} from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { ConditionGroup } from '../../../../core/models/decision-table.model';
import { PromptConfig } from '../../../../core/models/classification-decision-table.model';
import { FlowService } from '../../../../services/flow.service';
import { NodeType } from '../../../../core/enums/node-type';
import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';
import { MonacoCellEditorComponent } from './monaco-cell-editor/monaco-cell-editor.component';
import { MonacoCellRendererComponent } from './monaco-cell-renderer/monaco-cell-renderer.component';
import { PromptTooltipRendererComponent } from './prompt-tooltip-renderer/prompt-tooltip-renderer.component';
import { PromptIdCellEditorComponent } from './prompt-id-cell-editor/prompt-id-cell-editor.component';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
    selector: 'app-classification-decision-table-grid',
    standalone: true,
    imports: [AgGridModule, ButtonComponent, MonacoCellEditorComponent, MonacoCellRendererComponent, PromptTooltipRendererComponent, PromptIdCellEditorComponent],
    templateUrl: './classification-decision-table-grid.component.html',
    styleUrls: ['./classification-decision-table-grid.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationDecisionTableGridComponent implements OnInit {
    public conditionGroups = input.required<ConditionGroup[]>();
    public activeColor = input<string>('#685fff');
    public currentNodeId = input.required<string>();
    public prompts = input<Record<string, PromptConfig>>({});
    public defaultLlmId = input<string>('');
    public llmConfigs = input<{ id: number; label: string }[]>([]);

    public conditionGroupsChange = output<ConditionGroup[]>();
    public promptChange = output<{ promptId: string; field: keyof PromptConfig; value: any }>();
    public promptAdd = output<{ id: string; config: PromptConfig }>();

    private flowService = inject(FlowService);
    private cdr = inject(ChangeDetectorRef);

    private gridApi!: GridApi;
    public rowData = signal<ConditionGroup[]>([]);

    public isEmpty = computed(() => this.rowData().length === 0);

    public availableNodes = computed(() => {
        const nodes = this.flowService.nodes();
        const currentId = this.currentNodeId();
        return nodes
            .filter(
                (node: any) =>
                    node.id !== currentId &&
                    node.type !== NodeType.NOTE &&
                    node.type !== NodeType.EDGE &&
                    node.type !== NodeType.GROUP
            )
            .map((node: any) => ({
                label: node.node_name,
                value: node.id,
            }));
    });

    constructor() {
        effect(() => {
            const groups = this.conditionGroups();
            if (groups && groups.length > 0) {
                this.rowData.set([...groups]);
            }
        });
        effect(() => {
            this.prompts();
            if (this.gridApi) {
                this.gridApi.refreshCells({ columns: ['prompt_id'], force: true });
            }
        });
    }

    ngOnInit(): void {
        const groups = this.conditionGroups();
        if (groups && groups.length > 0) {
            this.rowData.set([...groups]);
        }
    }

    public myTheme = themeQuartz.withParams({
        backgroundColor: '#1e1e1e',
        foregroundColor: '#d4d4d4',
        headerBackgroundColor: '#27272b',
        headerTextColor: '#ffffff',
        oddRowBackgroundColor: '#252526',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        rowHoverColor: 'rgba(104, 95, 255, 0.1)',
        fontSize: 14,
    });

    public defaultColDef: ColDef = {
        sortable: false,
    };

    public gridOptions: GridOptions = {
        theme: this.myTheme,
        rowHeight: 50,
        headerHeight: 45,
        suppressMovableColumns: true,
        suppressCellFocus: false,
        singleClickEdit: true,
        stopEditingWhenCellsLoseFocus: true,
        domLayout: 'autoHeight',
        rowDragManaged: true,
        animateRows: true,
        onRowDragEnd: (event) => {
            const updatedRows = this.getUpdatedRows();
            this.emitChanges(updatedRows);
        },
    };

    public columnDefs: ColDef[] = [
        {
            headerName: '#',
            valueGetter: 'node.rowIndex + 1',
            width: 60,
            minWidth: 60,
            maxWidth: 60,
            rowDrag: true,
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.5)',
            },
        },
        {
            headerName: '',
            field: 'valid',
            editable: true,
            width: 50,
            minWidth: 50,
            maxWidth: 50,
            cellDataType: 'boolean',
            headerTooltip: 'Enabled',
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            },
        },
        {
            headerName: 'Condition Name',
            field: 'group_name',
            editable: true,
            flex: 1,
            minWidth: 150,
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Expression',
            field: 'expression',
            editable: false,
            flex: 1,
            minWidth: 200,
            cellRenderer: MonacoCellRendererComponent,
            cellStyle: {
                fontSize: '13px',
                fontFamily: 'monospace',
                color: '#d4d4d4',
            },
        },
        {
            headerName: 'Prompt ID',
            field: 'prompt_id',
            editable: true,
            width: 150,
            cellRenderer: PromptTooltipRendererComponent,
            cellRendererParams: () => ({
                prompts: this.prompts(),
                onPromptChange: (promptId: string, field: keyof PromptConfig, value: any) => {
                    this.promptChange.emit({ promptId, field, value });
                },
            }),
            cellEditor: PromptIdCellEditorComponent,
            cellEditorParams: () => ({
                prompts: this.prompts(),
                defaultLlmId: this.defaultLlmId(),
                llmConfigs: this.llmConfigs(),
                onAddPrompt: (id: string, config: PromptConfig) => {
                    this.promptAdd.emit({ id, config });
                },
                onPromptChange: (promptId: string, field: keyof PromptConfig, value: any) => {
                    this.promptChange.emit({ promptId, field, value });
                },
            }),
            cellEditorPopup: true,
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Manipulation',
            field: 'manipulation',
            editable: false,
            flex: 1,
            minWidth: 200,
            cellRenderer: MonacoCellRendererComponent,
            cellStyle: {
                fontSize: '13px',
                fontFamily: 'monospace',
                color: '#d4d4d4',
            },
        },
        {
            headerName: 'Continue',
            field: 'continue',
            editable: true,
            width: 110,
            cellDataType: 'boolean',
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            },
        },
        {
            headerName: 'Route Code',
            field: 'route_code',
            editable: true,
            width: 150,
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Dock Visible',
            field: 'dock_visible',
            editable: true,
            width: 120,
            cellDataType: 'boolean',
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            },
        },
        {
            headerName: '',
            field: 'actions',
            cellRenderer: () => {
                return `<i class="ti ti-trash" style="color: #ff3b30; font-size: 1.1rem; transition: all 0.2s ease; cursor: pointer;"></i>`;
            },
            width: 60,
            minWidth: 60,
            maxWidth: 60,
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
            },
            onCellClicked: (event: CellClickedEvent) => {
                this.deleteRow(event.node.rowIndex!);
            },
        },
    ];

    onGridReady(params: GridReadyEvent): void {
        this.gridApi = params.api;
    }

    onCellValueChanged(event: CellValueChangedEvent): void {
        const updatedRows = this.getUpdatedRows();
        this.emitChanges(updatedRows);
    }

    addRow(): void {
        const currentRows = this.rowData();
        const newRow: ConditionGroup = {
            group_name: `Condition ${currentRows.length + 1}`,
            group_type: 'complex',
            expression: null,
            conditions: [],
            manipulation: null,
            continue: false,
            route_code: `ROUTE_${currentRows.length + 1}`,
            dock_visible: true,
            next_node: null,
            order: currentRows.length + 1,
            valid: true,
        };

        this.rowData.set([...currentRows, newRow]);
        this.emitChanges([...currentRows, newRow]);
    }

    deleteRow(rowIndex: number): void {
        const currentRows = this.rowData();
        const updatedRows = currentRows.filter((_, index) => index !== rowIndex);
        this.rowData.set(updatedRows);
        this.emitChanges(updatedRows);
    }

    private getUpdatedRows(): ConditionGroup[] {
        const rows: ConditionGroup[] = [];
        this.gridApi.forEachNode((node) => {
            rows.push(node.data);
        });
        return rows.map((row, index) => ({ ...row, order: index + 1 }));
    }

    private emitChanges(rows: ConditionGroup[]): void {
        this.conditionGroupsChange.emit(rows);
        this.cdr.markForCheck();
    }
}
