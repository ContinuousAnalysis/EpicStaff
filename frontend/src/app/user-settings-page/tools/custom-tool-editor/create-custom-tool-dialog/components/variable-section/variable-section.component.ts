import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, effect, input, output, signal, viewChild } from '@angular/core';

import { AppSvgIconComponent } from '../../../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { DynamicTableComponent } from '../../../../../../shared/components/dynamic-table/dynamic-table.component';
import { TableRow } from '../../../../../../shared/components/dynamic-table/dynamic-table.models';
import { getCellExtraValidators, VariableInputType, VariableSectionConfig } from '../parameters-table.config';

@Component({
    selector: 'app-variable-section',
    imports: [AppSvgIconComponent, DynamicTableComponent],
    templateUrl: './variable-section.component.html',
    styleUrls: ['./variable-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariableSectionComponent {
    config = input.required<VariableSectionConfig>();
    initialRows = input<Record<string, unknown>[]>([]);
    externalDuplicates = input<Map<string, Set<string>> | null>(null);

    /** Cross-table row drag: stable tbody `cdkDropList` id; null disables connecting to other parameter tables. */
    rowDropListId = input<string | null>(null);
    rowDropListConnectedTo = input<string[]>([]);
    rowSyncRevision = input<number>(0);

    rowsChange = output<Record<string, unknown>[]>();
    navigateRow = output<{ row: TableRow; rowIndex: number; sectionType: VariableInputType }>();
    crossListDrop = output<CdkDragDrop<TableRow[]>>();

    private tableRef = viewChild<DynamicTableComponent>('table');
    readonly rows = signal<Record<string, unknown>[]>([]);

    readonly getCellExtraValidators = getCellExtraValidators;

    readonly isObjectRow = (row: TableRow): boolean => row.data['type'] === 'object';

    readonly isCellDisabled = (row: TableRow, colKey: string): boolean => {
        if (colKey !== 'default_value') {
            return false;
        }
        return row.data['type'] === 'object';
    };

    constructor() {
        effect(() => {
            const nextRows = this.initialRows();
            this.rows.set([...nextRows]);
        });
    }

    addRow(): void {
        this.tableRef()?.addRow();
    }

    onCrossListDrop(event: CdkDragDrop<TableRow[]>): void {
        this.crossListDrop.emit(event);
    }

    onRowsChange(rows: Record<string, unknown>[]): void {
        this.rows.set(rows);
        this.rowsChange.emit(rows);
    }

    validate(): void {
        this.tableRef()?.touchAll();
    }

    isValid(): boolean {
        const table = this.tableRef();
        return table ? table.isValid() : true;
    }

    onNavigate(event: { row: TableRow; rowIndex: number }): void {
        this.navigateRow.emit({ ...event, sectionType: this.config().inputType });
    }
}
