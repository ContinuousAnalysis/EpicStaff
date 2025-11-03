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
import { FlowService } from '../../../../services/flow.service';
import { NodeType } from '../../../../core/enums/node-type';
import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
    selector: 'app-decision-table-grid',
    standalone: true,
    imports: [AgGridModule, ButtonComponent],
    templateUrl: './decision-table-grid.component.html',
    styleUrls: ['./decision-table-grid.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableGridComponent implements OnInit {
    public conditionGroups = input.required<ConditionGroup[]>();
    public activeColor = input<string>('#685fff');

    public conditionGroupsChange = output<ConditionGroup[]>();

    private flowService = inject(FlowService);
    private cdr = inject(ChangeDetectorRef);

    private gridApi!: GridApi;
    public rowData = signal<ConditionGroup[]>([]);

    public availableNodes = computed(() => {
        const nodes = this.flowService.nodes();
        return nodes
            .filter((node) => node.type !== NodeType.NOTE)
            .map((node) => ({
                value: node.node_name || node.id,
                label: node.node_name || node.id,
            }));
    });

    ngOnInit(): void {
        const groups = this.conditionGroups();
        if (groups.length === 0) {
            this.rowData.set([this.createEmptyGroup()]);
        } else {
            this.rowData.set([...groups]);
        }
    }

    private createEmptyGroup(): ConditionGroup {
        return {
            group_name: '',
            group_type: 'complex',
            expression: null,
            conditions: [],
            manipulation: null,
            next_node: null,
        };
    }

    public myTheme = themeQuartz.withParams({
        accentColor: '#685fff',
        backgroundColor: '#1e1e20',
        browserColorScheme: 'dark',
        borderColor: '#c8ceda24',
        chromeBackgroundColor: '#222225',
        columnBorder: true,
        foregroundColor: '#d9d9de',
        headerBackgroundColor: '#222225',
        headerFontSize: 16,
        headerFontWeight: 500,
        headerTextColor: '#d9d9de',
        cellTextColor: '#d9d9de',
        spacing: 3.3,
        oddRowBackgroundColor: '#222226',
    });

    public columnDefs: ColDef[] = [
        {
            colId: 'index',
            headerName: '#',
            valueGetter: 'node.rowIndex + 1',
            editable: false,
            width: 60,
            minWidth: 60,
            maxWidth: 60,
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                color: '#999',
            },
        },
        {
            headerName: 'Group Name',
            field: 'group_name',
            editable: true,
            flex: 1,
            minWidth: 180,
            cellEditor: 'agLargeTextCellEditor',
            cellEditorParams: {
                maxLength: 10000,
            },
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Expression',
            field: 'expression',
            editable: true,
            flex: 1,
            minWidth: 200,
            cellEditor: 'agLargeTextCellEditor',
            cellEditorParams: {
                maxLength: 10000,
            },
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Manipulation',
            field: 'manipulation',
            editable: true,
            flex: 1,
            minWidth: 200,
            cellEditor: 'agLargeTextCellEditor',
            cellEditorParams: {
                maxLength: 10000,
            },
            cellStyle: {
                fontSize: '14px',
            },
        },
        {
            headerName: 'Next Node',
            field: 'next_node',
            editable: true,
            width: 200,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: (params: ICellEditorParams) => {
                const nodes = this.availableNodes();
                return {
                    values: ['', ...nodes.map((n) => n.value)],
                };
            },
            cellStyle: {
                fontSize: '14px',
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
            editable: false,
        },
    ];

    public defaultColDef: ColDef = {
        sortable: false,
        resizable: false,
        wrapText: true,
        suppressMovable: true,
    };

    public gridOptions: GridOptions = {
        rowHeight: 60,
        headerHeight: 50,
        theme: this.myTheme,
        animateRows: true,
        suppressColumnVirtualisation: false,
        stopEditingWhenCellsLoseFocus: true,
        onCellValueChanged: (event: CellValueChangedEvent) =>
            this.onCellValueChanged(event),
        onCellClicked: (event: CellClickedEvent) => this.onCellClicked(event),
    };

    public onGridReady(params: GridReadyEvent): void {
        this.gridApi = params.api;
        this.cdr.markForCheck();
    }

    public onCellValueChanged(event: CellValueChangedEvent): void {
        const updatedData = [...this.rowData()];
        this.rowData.set(updatedData);
        this.emitChanges();
    }

    public onCellClicked(event: CellClickedEvent): void {
        if (event.colDef.field === 'actions') {
            const rowIndex = event.rowIndex;
            if (rowIndex !== null && rowIndex !== undefined) {
                this.removeConditionGroup(rowIndex);
            }
        }
    }

    public addConditionGroup(): void {
        const newGroup = this.createEmptyGroup();
        const updated = [...this.rowData(), newGroup];
        this.rowData.set(updated);

        if (this.gridApi) {
            this.gridApi.setGridOption('rowData', updated);
        }

        this.emitChanges();
    }

    public removeConditionGroup(index: number): void {
        const updated = this.rowData().filter((_, i) => i !== index);
        this.rowData.set(updated);

        if (this.gridApi) {
            this.gridApi.setGridOption('rowData', updated);
        }

        this.emitChanges();
    }

    private emitChanges(): void {
        this.conditionGroupsChange.emit(this.rowData());
    }
}

