import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    input,
    OnInit,
    output,
    signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppSvgIconComponent } from '../app-svg-icon/app-svg-icon.component';
import { CheckboxComponent } from '../checkbox/checkbox.component';
import { TableColumnDef, TableRow } from './dynamic-table.models';

@Component({
    selector: 'app-dynamic-table',
    imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, AppSvgIconComponent, CheckboxComponent],
    templateUrl: './dynamic-table.component.html',
    styleUrls: ['./dynamic-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicTableComponent implements OnInit {
    private destroyRef = inject(DestroyRef);

    // Header
    title = input.required<string>();
    icon = input<string | null>(null); // svg icon name, null means no icon

    // Column definitions
    columnDefs = input.required<TableColumnDef[]>();

    // Initial rows value (for external initial data)
    initialRows = input<Record<string, unknown>[]>([]);

    // Feature flags
    allowRowDrag = input<boolean>(true);
    allowColumnDrag = input<boolean>(true);

    // Constraints
    maxHeight = input<string | null>(null); // e.g. '400px', null = no limit
    maxRows = input<number | null>(null); // null = unlimited

    // Outputs
    rowsChange = output<Record<string, unknown>[]>();

    // Internal state
    columns = signal<TableColumnDef[]>([]);
    rows = signal<TableRow[]>([]);

    // FormControls map: key = `${rowId}_${colKey}`
    private cellControls = new Map<string, FormControl>();

    // Validation error bar
    validationError = signal<string | null>(null);
    showValidationBar = computed(() => this.validationError() !== null);

    canAddRow = computed(() => {
        const max = this.maxRows();
        return max === null || this.rows().length < max;
    });

    // Column resize
    colWidths = signal<Record<string, number>>({});
    tableMinWidth = computed(() => {
        const spacers = (this.allowRowDrag() ? 36 : 0) + 36; // drag handle + action
        return this.columns().reduce((sum, col) => sum + this.getColWidth(col.key), spacers);
    });
    private resizeMoveHandler: ((e: MouseEvent) => void) | null = null;
    private resizeUpHandler: (() => void) | null = null;

    ngOnInit(): void {
        this.columns.set([...this.columnDefs()]);
        this.initColWidths();

        this.destroyRef.onDestroy(() => {
            if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler);
            if (this.resizeUpHandler) document.removeEventListener('mouseup', this.resizeUpHandler);
        });

        const initial = this.initialRows();
        if (initial.length > 0) {
            const rows = initial.map((data) => this.createRowFromData(data));
            this.rows.set(rows);
        }
    }

    // --- Row Operations ---

    addRow(): void {
        if (!this.canAddRow()) return;

        const newRow: TableRow = {
            _id: this.generateId(),
            data: {},
        };

        // Initialize default values
        for (const col of this.columns()) {
            if (col.type === 'checkbox') {
                newRow.data[col.key] = false;
            } else {
                newRow.data[col.key] = '';
            }
        }

        this.rows.update((rows) => [...rows, newRow]);
        // Create controls for new row
        this.initRowControls(newRow);
        this.emitChange();
    }

    removeRow(rowId: string): void {
        // Clean up controls
        const row = this.rows().find((r) => r._id === rowId);
        if (row) {
            for (const col of this.columns()) {
                this.cellControls.delete(`${rowId}_${col.key}`);
            }
        }

        this.rows.update((rows) => rows.filter((r) => r._id !== rowId));
        this.validateAll();
        this.emitChange();
    }

    onRowDrop(event: CdkDragDrop<TableRow[]>): void {
        if (!this.allowRowDrag()) return;
        const rows = [...this.rows()];
        moveItemInArray(rows, event.previousIndex, event.currentIndex);
        this.rows.set(rows);
        this.emitChange();
    }

    onColumnDrop(event: CdkDragDrop<TableColumnDef[]>): void {
        if (!this.allowColumnDrag()) return;
        const cols = [...this.columns()];
        moveItemInArray(cols, event.previousIndex, event.currentIndex);
        this.columns.set(cols);
    }

    // --- Cell Value Updates ---

    onCellChange(rowId: string, colKey: string, value: unknown): void {
        this.rows.update((rows) =>
            rows.map((r) => (r._id === rowId ? { ...r, data: { ...r.data, [colKey]: value } } : r))
        );

        const control = this.cellControls.get(`${rowId}_${colKey}`);
        if (control) {
            control.markAsTouched();
            control.setValue(value);
        }

        this.validateAll();
        this.emitChange();
    }

    getCellValue(rowId: string, colKey: string): unknown {
        const row = this.rows().find((r) => r._id === rowId);
        return row?.data[colKey] ?? '';
    }

    getControl(rowId: string, colKey: string): FormControl {
        const key = `${rowId}_${colKey}`;
        if (!this.cellControls.has(key)) {
            const row = this.rows().find((r) => r._id === rowId);
            const col = this.columns().find((c) => c.key === colKey);
            const value = row?.data[colKey] ?? '';
            this.cellControls.set(key, new FormControl(value, col?.validators ?? []));
        }
        return this.cellControls.get(key)!;
    }

    isCellInvalid(rowId: string, colKey: string): boolean {
        const control = this.cellControls.get(`${rowId}_${colKey}`);
        return !!(control && control.invalid && control.touched);
    }

    // --- Validation ---

    private validateAll(): void {
        let firstError: string | null = null;

        for (const row of this.rows()) {
            for (const col of this.columns()) {
                if (!col.validators?.length) continue;
                const control = this.cellControls.get(`${row._id}_${col.key}`);
                if (control && control.invalid && control.touched) {
                    firstError = this.getErrorMessage(col, control);
                    break;
                }
            }
            if (firstError) break;
        }

        this.validationError.set(firstError);
    }

    private getErrorMessage(col: TableColumnDef, control: FormControl): string {
        if (!control.errors) return '';
        const errorKey = Object.keys(control.errors)[0];
        if (col.errorMessages?.[errorKey]) {
            return col.errorMessages[errorKey];
        }
        // Default messages
        const defaults: Record<string, string> = {
            required: `Please provide a ${col.header.toLowerCase()}. This field cannot be empty.`,
            minlength: `${col.header} is too short.`,
            maxlength: `${col.header} is too long.`,
            min: `${col.header} value is too small.`,
            max: `${col.header} value is too large.`,
            pattern: `${col.header} format is invalid.`,
            email: `Please enter a valid email address.`,
        };
        return defaults[errorKey] ?? `${col.header} is invalid.`;
    }

    dismissValidationError(): void {
        this.validationError.set(null);
    }

    // --- Helpers ---

    private createRowFromData(data: Record<string, unknown>): TableRow {
        const row: TableRow = { _id: this.generateId(), data: { ...data } };
        this.initRowControls(row);
        return row;
    }

    private initRowControls(row: TableRow): void {
        for (const col of this.columns()) {
            const key = `${row._id}_${col.key}`;
            const value = row.data[col.key] ?? (col.type === 'checkbox' ? false : '');
            this.cellControls.set(key, new FormControl(value, col.validators ?? []));
        }
    }

    private emitChange(): void {
        this.rowsChange.emit(this.rows().map((r) => ({ ...r.data })));
    }

    private generateId(): string {
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    // --- Column Resize ---

    getColWidth(colKey: string): number {
        return this.colWidths()[colKey] ?? 120;
    }

    onResizeStart(event: MouseEvent, colKey: string): void {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = this.getColWidth(colKey);

        this.resizeMoveHandler = (e: MouseEvent) => {
            const newWidth = Math.max(40, startWidth + e.clientX - startX);
            this.colWidths.update((w) => ({ ...w, [colKey]: newWidth }));
        };

        this.resizeUpHandler = () => {
            document.removeEventListener('mousemove', this.resizeMoveHandler!);
            document.removeEventListener('mouseup', this.resizeUpHandler!);
            this.resizeMoveHandler = null;
            this.resizeUpHandler = null;
        };

        document.addEventListener('mousemove', this.resizeMoveHandler);
        document.addEventListener('mouseup', this.resizeUpHandler);
    }

    private initColWidths(): void {
        const widths: Record<string, number> = {};
        for (const col of this.columnDefs()) {
            const parsed = col.width ? parseInt(col.width, 10) : 120;
            widths[col.key] = isNaN(parsed) ? 120 : parsed;
        }
        this.colWidths.set(widths);
    }

    trackByRowId(_: number, row: TableRow): string {
        return row._id;
    }

    trackByColKey(_: number, col: TableColumnDef): string {
        return col.key;
    }
}
