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
    public currentNodeId = input.required<string>();

    public conditionGroupsChange = output<ConditionGroup[]>();

    private flowService = inject(FlowService);
    private cdr = inject(ChangeDetectorRef);

    private gridApi!: GridApi;
    public rowData = signal<ConditionGroup[]>([]);

    public availableNodes = computed(() => {
        const nodes = this.flowService.nodes();
        const currentId = this.currentNodeId();
        
        return nodes
            .filter((node) => 
                node.type !== NodeType.NOTE && 
                node.type !== NodeType.START &&
                node.id !== currentId
            )
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
            const groupsWithValidFlag = groups.map(group => {
                this.updateGroupValidFlag(group);
                return group;
            });
            this.rowData.set([...groupsWithValidFlag]);
        }
    }

    private createEmptyGroup(): ConditionGroup {
        const existingNames = this.rowData().map(g => g.group_name);
        let newName = '';
        let counter = this.rowData().length + 1;
        
        do {
            newName = `Group ${counter}`;
            counter++;
        } while (existingNames.includes(newName));
        
        return {
            group_name: newName,
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
            cellClassRules: {
                'cell-warning': (params) => !!(params.data as any).group_nameWarning,
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
            cellClassRules: {
                'cell-warning': (params) => !!(params.data as any).expressionWarning,
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
            cellClassRules: {
                'cell-warning': (params) => !!(params.data as any).manipulationWarning,
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
        const colId = event.column.getColId();
        const rowIndex = event.rowIndex!;
        
        if (colId === 'group_name') {
            const newName = event.newValue?.trim();
            const isEmpty = !newName;
            const isDuplicate = !isEmpty && this.rowData().some((row, idx) => 
                idx !== rowIndex && row.group_name === newName
            );
            
            (event.data as any).group_nameWarning = isEmpty || isDuplicate;
        } else if (colId === 'expression') {
            (event.data as any).expressionWarning = !event.newValue?.trim();
        } else if (colId === 'manipulation') {
            (event.data as any).manipulationWarning = !event.newValue?.trim();
        }
        
        this.updateGroupValidFlag(event.data);
        
        this.gridApi.refreshCells({
            rowNodes: [event.node],
            columns: [colId],
        });
        
        const updatedData = [...this.rowData()];
        this.rowData.set(updatedData);
        this.emitChanges();
    }

    private updateGroupValidFlag(group: ConditionGroup): void {
        const hasValidName = !!(group.group_name?.trim());
        const hasNoDuplicateName = !this.rowData().some(
            (g) => g !== group && g.group_name === group.group_name
        );
        const hasExpression = !!(group.expression?.trim());
        const hasManipulation = !!(group.manipulation?.trim());
        
        group.valid = hasValidName && hasNoDuplicateName && hasExpression && hasManipulation;
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
        this.updateGroupValidFlag(newGroup);
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
        const updatedGroups = this.rowData().map(group => {
            this.updateGroupValidFlag(group);
            return group;
        });
        
        this.conditionGroupsChange.emit(updatedGroups);
    }
}

