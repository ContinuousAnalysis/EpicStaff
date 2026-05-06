import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    computed,
    effect,
    ElementRef,
    inject,
    input,
    OnDestroy,
    output,
    Renderer2,
    signal,
    untracked,
    ViewChild,
} from '@angular/core';
import { AgGridModule } from 'ag-grid-angular';
import {
    CellClickedEvent,
    CellValueChangedEvent,
    ColDef,
    ColGroupDef,
    ColumnMovedEvent,
    ColumnResizedEvent,
    EditableCallbackParams,
    GridApi,
    GridOptions,
    GridReadyEvent,
    RowSpanParams,
    ValueGetterParams,
    ValueSetterParams,
} from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';

import { ButtonComponent } from '../../../../../shared/components/buttons/button/button.component';
import { HelpTooltipComponent } from '../../../../../shared/components/help-tooltip/help-tooltip.component';
import { MultiSelectComponent } from '../../../../../shared/components/multi-select/multi-select.component';
import { SelectItem } from '../../../../../shared/components/select/select.component';
import { PromptConfig } from '../../../../core/models/classification-decision-table.model';
import { ConditionGroup } from '../../../../core/models/decision-table.model';
import {
    composeExpression,
    composeManipulation,
    normalizeExpressionSpacing,
    normalizeOpPart,
    parseExpression,
    parseManipulation,
} from '../../../../utils/condition-expression.helper';
import { ColumnHeaderMenuComponent } from './column-header-menu/column-header-menu.component';
import { IconHeaderComponent } from './icon-header/icon-header.component';
import { MonacoCellRendererComponent } from './monaco-cell-renderer/monaco-cell-renderer.component';
import { ParamsGroupHeaderComponent } from './params-group-header/params-group-header.component';
import { PromptIdCellEditorComponent } from './prompt-id-cell-editor/prompt-id-cell-editor.component';
import { PromptTooltipRendererComponent } from './prompt-tooltip-renderer/prompt-tooltip-renderer.component';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
    selector: 'app-classification-decision-table-grid',
    imports: [AgGridModule, ButtonComponent, HelpTooltipComponent, MultiSelectComponent],
    templateUrl: './classification-decision-table-grid.component.html',
    styleUrls: ['./classification-decision-table-grid.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassificationDecisionTableGridComponent implements OnDestroy {
    public conditionGroups = input.required<ConditionGroup[]>();
    public activeColor = input<string>('#685fff');
    public currentNodeId = input.required<string>();
    public storageNodeId = input<string>('');
    public prompts = input<Record<string, PromptConfig>>({});
    public defaultLlmId = input<number | null>(null);
    public llmConfigs = input<{ id: number; label: string }[]>([]);
    public preInputMapKeys = input<string[]>([]);
    public domainKeys = input<string[]>([]);

    public conditionGroupsChange = output<ConditionGroup[]>();
    public promptChange = output<{
        promptId: string;
        field: keyof PromptConfig;
        value: PromptConfig[keyof PromptConfig];
    }>();
    public promptAdd = output<{ id: string; config: PromptConfig }>();

    private cdr = inject(ChangeDetectorRef);
    private elRef = inject(ElementRef);
    private renderer = inject(Renderer2);

    private gridApi!: GridApi;
    private outsideClickUnlisten: (() => void) | null = null;
    private fieldColumnsInitialized = false;
    public rowData = signal<ConditionGroup[]>([]);
    public contextMenu = signal<{ x: number; y: number; rowIndex: number } | null>(null);

    // Ordered list of ALL movable colIds (field_* and expression)
    private movableColumnOrder = signal<string[]>(['expression']);

    // Manipulation field columns (manip_* and manipulation)
    private manipColumnOrder = signal<string[]>(['manipulation']);

    // Frozen column IDs (pinned left)
    public frozenColIds = signal<Set<string>>(new Set());

    // User-hidden column IDs
    public hiddenColIds = signal<Set<string>>(new Set());

    // Hidden-column restore badges: position computed from DOM
    public hiddenColumnBadges = signal<Array<{ colId: string; x: number; y: number; label: string }>>([]);

    // Computed: field names in their column order
    public activeFieldColumns = computed(() =>
        this.movableColumnOrder()
            .filter((id) => id.startsWith('field_'))
            .map((id) => id.substring(6))
    );

    public isEmpty = computed(() => this.rowData().length === 0);

    // Manipulation field computed properties
    public activeManipFieldColumns = computed(() =>
        this.manipColumnOrder()
            .filter((id) => id.startsWith('manip_'))
            .map((id) => id.substring(6))
    );

    public hasFieldCols = computed(() => this.movableColumnOrder().some((id) => id.startsWith('field_')));

    public hasManipCols = computed(() => this.manipColumnOrder().some((id) => id.startsWith('manip_')));

    // ── Multi-select items for the field pickers ──

    /** Items for the expression-side field picker, grouped by Domain then Input Map.
     *  Deduplication: Domain takes precedence over Input Map. */
    public exprMultiSelectItems = computed<SelectItem[]>(() => {
        const domainKeys = this.domainKeys();
        const domainSet = new Set(domainKeys);
        const seen = new Set<string>();
        const items: SelectItem[] = [];

        // Domain first
        for (const k of domainKeys) {
            if (!seen.has(k)) {
                seen.add(k);
                items.push({ name: k, value: k, group: 'Domain' });
            }
        }

        // Input Map (exclude keys already classified as Domain)
        for (const k of this.preInputMapKeys()) {
            if (!seen.has(k) && !domainSet.has(k)) {
                seen.add(k);
                items.push({ name: k, value: k, group: 'Input Map' });
            }
        }

        return items;
    });

    /** Items for the manipulation-side field picker. Domain only. */
    public manipMultiSelectItems = computed<SelectItem[]>(() => {
        const seen = new Set<string>();
        const items: SelectItem[] = [];

        for (const k of this.domainKeys()) {
            if (!seen.has(k)) {
                seen.add(k);
                items.push({ name: k, value: k, group: 'Domain' });
            }
        }

        return items;
    });

    // Pre-open model value signals for the multi-selects
    public exprSelectedFieldsModel = signal<unknown[]>([]);
    public manipSelectedFieldsModel = signal<unknown[]>([]);

    @ViewChild('exprMultiSelect') exprMultiSelect!: MultiSelectComponent;
    @ViewChild('manipMultiSelect') manipMultiSelect!: MultiSelectComponent;

    public exprAddPos = signal<{ x: number; y: number } | null>(null);
    public manipAddPos = signal<{ x: number; y: number } | null>(null);
    private positionResizeObserver: ResizeObserver | null = null;

    constructor() {
        effect(() => {
            const groups = this.conditionGroups();
            if (groups && groups.length > 0) {
                this.rowData.set([...groups]);
                if (!this.fieldColumnsInitialized) {
                    this.initFieldColumnsFromData(groups);
                    this.fieldColumnsInitialized = true;
                }
            }
        });
        effect(() => {
            this.prompts();
            if (this.gridApi) {
                this.gridApi.refreshCells({ columns: ['prompt_id'], force: true });
            }
        });
        effect(() => {
            this.movableColumnOrder();
            this.manipColumnOrder();
            this.rebuildColumnDefs();
            this.syncRowsFromExpression();
            this.syncRowsFromManipulation();
        });
    }

    private initFieldColumnsFromData(groups: ConditionGroup[]): void {
        // Restore saved state first
        this.restoreGridState();

        const fieldKeys = new Set<string>();
        const manipKeys = new Set<string>();
        groups.forEach((g) => {
            if (g.field_expressions) {
                Object.keys(g.field_expressions).forEach((k) => fieldKeys.add(k));
            }
            if (g.field_manipulations) {
                Object.keys(g.field_manipulations).forEach((k) => manipKeys.add(k));
            }
        });
        if (fieldKeys.size > 0 && this.movableColumnOrder().length <= 1) {
            const colIds = ['expression', ...[...fieldKeys].map((f) => `field_${f}`)];
            this.movableColumnOrder.set(colIds);
        }
        if (manipKeys.size > 0 && this.manipColumnOrder().length <= 1) {
            const colIds = ['manipulation', ...[...manipKeys].map((f) => `manip_${f}`)];
            this.manipColumnOrder.set(colIds);
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
        columnBorder: { style: 'solid', width: 1, color: 'rgba(255, 255, 255, 0.07)' },
        fontSize: 14,
    });

    public defaultColDef: ColDef = {
        sortable: false,
        resizable: true,
        minWidth: 30,
    };

    private unmergedGroup = signal<{ colId: string; startRow: number; endRow: number } | null>(null);
    private savedColumnWidths = new Map<string, number>();
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private isRebuilding = false;
    /** Guard flag to prevent recursive cellValueChanged loops during programmatic cell writes. */
    private isSyncing = false;

    private get storageKey(): string {
        const stableId = this.storageNodeId() || this.currentNodeId();
        return `cdt-grid-state-${stableId}`;
    }

    private saveGridState(): void {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            const widths: Record<string, number> = {};
            this.gridApi?.getColumnState()?.forEach((s) => {
                if (s.colId && s.width) widths[s.colId] = s.width;
            });
            const state = {
                widths,
                order: this.movableColumnOrder(),
                manipOrder: this.manipColumnOrder(),
                pinned: [...this.frozenColIds()],
                hiddenColIds: [...this.hiddenColIds()],
            };
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(state));
            } catch {}
        }, 300);
    }

    private restoreGridState(): void {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (state.widths) {
                Object.entries(state.widths).forEach(([k, v]) => this.savedColumnWidths.set(k, v as number));
            }
            if (state.order?.length > 0) {
                this.movableColumnOrder.set(state.order);
            }
            if (state.manipOrder?.length > 0) {
                this.manipColumnOrder.set(state.manipOrder);
            }
            if (Array.isArray(state.pinned) && state.pinned.length > 0) {
                this.frozenColIds.set(new Set(state.pinned as string[]));
            }
            if (Array.isArray(state.hiddenColIds) && state.hiddenColIds.length > 0) {
                this.hiddenColIds.set(new Set(state.hiddenColIds as string[]));
            }
        } catch {}
    }

    public gridOptions: GridOptions = {
        theme: this.myTheme,
        rowHeight: 50,
        headerHeight: 45,
        suppressRowTransform: true,
        suppressCellFocus: false,
        singleClickEdit: true,
        stopEditingWhenCellsLoseFocus: true,
        domLayout: 'autoHeight',
        rowDragManaged: true,
        animateRows: true,
        onRowDragEnd: () => {
            const updatedRows = this.getUpdatedRows();
            this.emitChanges(updatedRows);
        },
        preventDefaultOnContextMenu: true,
        onCellContextMenu: (event) => {
            const mouseEvent = event.event as MouseEvent;
            this.contextMenu.set({
                x: mouseEvent.clientX,
                y: mouseEvent.clientY,
                rowIndex: event.node.rowIndex!,
            });
            this.cdr.markForCheck();
        },
        onColumnMoved: (event: ColumnMovedEvent) => {
            if (this.isRebuilding) return;
            if (!event.finished) return;
            const colState = this.gridApi?.getColumnState();
            if (!colState) return;
            const allVisible = colState.map((s) => s.colId!);

            // Update expression column order
            const exprResult = allVisible.filter((id) => id?.startsWith('field_') || id === 'expression');
            this.movableColumnOrder.set(exprResult);

            // Update manipulation column order
            const manipResult = allVisible.filter((id) => id?.startsWith('manip_') || id === 'manipulation');
            this.manipColumnOrder.set(manipResult);
            this.saveGridState();
        },
        onColumnResized: (event: ColumnResizedEvent) => {
            if (event.finished) {
                this.saveGridState();
                setTimeout(() => this.updateAddButtonPositions(), 0);
            }
        },
    };

    public columnDefs: (ColDef | ColGroupDef)[] = this.buildColumnDefs();

    // ── Freeze / Hide helpers ──

    private makeMenuHeaderParams(colId: string, label: string): object {
        return {
            label,
            colId,
            onFreezeToggle: (id: string) => this.toggleFreeze(id),
            onHide: (id: string) => this.hideColumn(id),
            isPinned: () => this.frozenColIds().has(colId),
        };
    }

    public toggleFreeze(colId: string): void {
        const fullOrder = this.getFullColOrder();
        const targetIdx = fullOrder.indexOf(colId);
        if (targetIdx === -1) return;

        const wasFrozen = this.frozenColIds().has(colId);

        // Determine the new frozen prefix
        let newFrozenIds: string[];
        if (wasFrozen) {
            // Unfreeze: clear the entire frozen set
            newFrozenIds = [];
        } else {
            // Freeze: pin every column from index 0 up to and including targetIdx
            newFrozenIds = fullOrder.slice(0, targetIdx + 1);
        }

        const newFrozenSet = new Set(newFrozenIds);

        // Build state updates: set pinned:'left' for new frozen set, null for previously frozen cols no longer in set
        const stateUpdates: { colId: string; pinned: 'left' | null }[] = [];
        const previouslyFrozen = this.frozenColIds();
        for (const id of fullOrder) {
            const shouldBeFrozen = newFrozenSet.has(id);
            const wasPinned = previouslyFrozen.has(id);
            if (shouldBeFrozen && !wasPinned) {
                stateUpdates.push({ colId: id, pinned: 'left' });
            } else if (!shouldBeFrozen && wasPinned) {
                stateUpdates.push({ colId: id, pinned: null });
            }
        }

        this.frozenColIds.set(newFrozenSet);
        if (stateUpdates.length > 0) {
            this.gridApi?.applyColumnState({ state: stateUpdates });
        }
        this.gridApi?.refreshHeader();
        this.saveGridState();
        this.cdr.markForCheck();
    }

    public hideColumn(colId: string): void {
        const current = new Set(this.hiddenColIds());
        current.add(colId);
        this.hiddenColIds.set(current);
        this.gridApi?.applyColumnState({
            state: [{ colId, hide: true }],
        });
        this.saveGridState();
        setTimeout(() => this.updateBadgePositions(), 50);
        this.cdr.markForCheck();
    }

    public unhideColumn(colId: string): void {
        const current = new Set(this.hiddenColIds());
        current.delete(colId);
        this.hiddenColIds.set(current);
        this.gridApi?.applyColumnState({
            state: [{ colId, hide: false }],
        });
        this.saveGridState();
        setTimeout(() => this.updateBadgePositions(), 50);
        this.cdr.markForCheck();
    }

    /** Freeze all columns from index 0 through the last colId in childColIds. */
    public freezeThroughLastChild(childColIds: string[]): void {
        if (childColIds.length === 0) return;
        const fullOrder = this.getFullColOrder();
        const lastChild = childColIds[childColIds.length - 1];
        const targetIdx = fullOrder.indexOf(lastChild);
        if (targetIdx === -1) return;

        const newFrozenIds = fullOrder.slice(0, targetIdx + 1);
        const newFrozenSet = new Set(newFrozenIds);
        const previouslyFrozen = this.frozenColIds();

        const stateUpdates: { colId: string; pinned: 'left' | null }[] = [];
        for (const id of fullOrder) {
            const shouldBeFrozen = newFrozenSet.has(id);
            const wasPinned = previouslyFrozen.has(id);
            if (shouldBeFrozen && !wasPinned) {
                stateUpdates.push({ colId: id, pinned: 'left' });
            } else if (!shouldBeFrozen && wasPinned) {
                stateUpdates.push({ colId: id, pinned: null });
            }
        }

        this.frozenColIds.set(newFrozenSet);
        if (stateUpdates.length > 0) {
            this.gridApi?.applyColumnState({ state: stateUpdates });
        }
        this.gridApi?.refreshHeader();
        this.saveGridState();
        this.cdr.markForCheck();
    }

    /** Hide all columns in the given colIds in a single batched applyColumnState call. */
    public hideColumns(colIds: string[]): void {
        if (colIds.length === 0) return;
        const current = new Set(this.hiddenColIds());
        colIds.forEach((id) => current.add(id));
        this.hiddenColIds.set(current);
        this.gridApi?.applyColumnState({
            state: colIds.map((colId) => ({ colId, hide: true })),
        });
        this.saveGridState();
        setTimeout(() => this.updateBadgePositions(), 50);
        this.cdr.markForCheck();
    }

    // Compute the full ordered list of all colIds (excluding structural ones like 'actions')
    private getFullColOrder(): string[] {
        const order: string[] = [];
        for (const def of this.columnDefs) {
            if ('children' in def) {
                // Group — add children
                const group = def as ColGroupDef;
                for (const child of group.children as ColDef[]) {
                    if (child.colId) order.push(child.colId);
                }
            } else {
                const col = def as ColDef;
                const id = col.colId || col.field;
                if (id && id !== 'actions') order.push(id);
            }
        }
        return order;
    }

    private updateBadgePositions(): void {
        const hidden = this.hiddenColIds();
        if (hidden.size === 0) {
            this.hiddenColumnBadges.set([]);
            return;
        }

        const fullOrder = this.getFullColOrder();
        const badges: Array<{ colId: string; x: number; y: number; label: string }> = [];
        // Badge is rendered inside .grid-wrapper (position: relative), so coords must be relative to it.
        const wrapperEl = this.elRef.nativeElement.querySelector('.grid-wrapper') as HTMLElement | null;
        const containerRect = (wrapperEl ?? this.elRef.nativeElement).getBoundingClientRect();

        // Position badge ABOVE the AG Grid header strip (outside the table, sitting on its top edge)
        const headerEl = this.elRef.nativeElement.querySelector('.ag-header') as HTMLElement | null;
        const headerRect = headerEl?.getBoundingClientRect();
        const y = headerRect ? headerRect.top - containerRect.top - 24 : -24;

        for (const hiddenId of hidden) {
            const hiddenIdx = fullOrder.indexOf(hiddenId);
            if (hiddenIdx === -1) continue;

            const colLabel = this.getColLabel(hiddenId);

            // Find nearest visible column to the LEFT of this hidden column
            let prevVisibleColId: string | null = null;
            for (let i = hiddenIdx - 1; i >= 0; i--) {
                if (!hidden.has(fullOrder[i])) {
                    prevVisibleColId = fullOrder[i];
                    break;
                }
            }

            // Find nearest visible column to the RIGHT (skip consecutive hidden cols)
            let nextVisibleColId: string | null = null;
            for (let i = hiddenIdx + 1; i < fullOrder.length; i++) {
                if (!hidden.has(fullOrder[i])) {
                    nextVisibleColId = fullOrder[i];
                    break;
                }
            }

            if (!prevVisibleColId && !nextVisibleColId) continue;

            const prevHeader = prevVisibleColId
                ? (this.elRef.nativeElement.querySelector(
                      `.ag-header-cell[col-id="${prevVisibleColId}"]`
                  ) as HTMLElement | null)
                : null;
            const nextHeader = nextVisibleColId
                ? (this.elRef.nativeElement.querySelector(
                      `.ag-header-cell[col-id="${nextVisibleColId}"]`
                  ) as HTMLElement | null)
                : null;

            const prevRect = prevHeader?.getBoundingClientRect() ?? null;
            const nextRect = nextHeader?.getBoundingClientRect() ?? null;

            let boundaryX: number;
            if (prevRect && nextRect) {
                // Place badge on the boundary between the two adjacent visible columns
                boundaryX = (prevRect.right + nextRect.left) / 2 - containerRect.left - 10;
            } else if (nextRect) {
                // Hidden column is the very first — anchor to left edge of next visible
                boundaryX = nextRect.left - containerRect.left - 10;
            } else {
                // Hidden column is the very last — anchor to right edge of prev visible
                boundaryX = prevRect!.right - containerRect.left - 10;
            }

            // Offset stacking: if another badge already sits at the same boundary, shift right
            const existing = badges.filter((b) => Math.abs(b.x - boundaryX) < 5);
            const offsetX = existing.length * 22;

            badges.push({ colId: hiddenId, x: boundaryX + offsetX, y, label: colLabel });
        }

        this.hiddenColumnBadges.set(badges);
        this.cdr.markForCheck();
    }

    private getColLabel(colId: string): string {
        if (colId === 'expression') return 'Expression';
        if (colId === 'manipulation') return 'Manipulation';
        if (colId === 'prompt_id') return 'Prompt';
        if (colId === 'route_code') return 'Route Code';
        if (colId === 'group_name') return 'Condition Name';
        if (colId === 'next_node') return 'Next Node';
        if (colId.startsWith('field_')) return colId.substring(6);
        if (colId.startsWith('manip_')) return colId.substring(6);
        return colId;
    }

    private buildFieldColDef(fieldName: string): ColDef {
        const colId = `field_${fieldName}`;
        return {
            colId,
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: {
                label: fieldName,
                colId,
                iconClass: 'ti ti-x',
                tooltip: `Remove variable "${fieldName}"`,
                variant: 'delete',
                showFreeze: false,
                showChevron: false,
                onIconClick: () => this.removeFieldColumn(fieldName),
            },
            editable: (params: EditableCallbackParams<ConditionGroup>) =>
                !this.isRowLocked(params.data as ConditionGroup),
            minWidth: Math.max(70, fieldName.length * 9 + 52),
            flex: 1,
            cellRenderer: MonacoCellRendererComponent,
            cellRendererParams: { singleLine: true },
            rowSpan: (params: RowSpanParams<ConditionGroup>) =>
                this.getRowSpan(params, `field_${fieldName}`, (d) => d?.field_expressions?.[fieldName] || ''),
            cellStyle: (params: RowSpanParams<ConditionGroup>) => {
                const locked = this.isRowLocked(params.data as ConditionGroup);
                const base = locked
                    ? { fontSize: '13px', fontFamily: 'monospace', color: '#888888' }
                    : { fontSize: '13px', fontFamily: 'monospace', color: '#d4d4d4' };
                return this.getSpanCellStyle(
                    params,
                    `field_${fieldName}`,
                    (d) => d?.field_expressions?.[fieldName] || '',
                    base
                );
            },
            valueGetter: (params: ValueGetterParams<ConditionGroup>) => {
                if (this.isRowLocked(params.data as ConditionGroup)) return '*';
                return params.data?.field_expressions?.[fieldName] || '';
            },
            valueSetter: (params: ValueSetterParams<ConditionGroup>) => {
                if (!params.data.field_expressions) {
                    params.data.field_expressions = {};
                }
                params.data.field_expressions[fieldName] = normalizeOpPart(params.newValue || '');
                return true;
            },
        };
    }

    private buildManipFieldColDef(fieldName: string): ColDef {
        const colId = `manip_${fieldName}`;
        return {
            colId,
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: {
                label: fieldName,
                colId,
                iconClass: 'ti ti-x',
                tooltip: `Remove variable "${fieldName}"`,
                variant: 'delete',
                showFreeze: false,
                showChevron: false,
                onIconClick: () => this.removeManipFieldColumn(fieldName),
            },
            editable: (params: EditableCallbackParams<ConditionGroup>) =>
                !this.isManipRowLocked(params.data as ConditionGroup),
            minWidth: Math.max(70, fieldName.length * 9 + 52),
            flex: 1,
            cellRenderer: MonacoCellRendererComponent,
            cellRendererParams: { singleLine: true },
            cellStyle: (params: RowSpanParams<ConditionGroup>) => {
                const locked = this.isManipRowLocked(params.data as ConditionGroup);
                return locked
                    ? { fontSize: '13px', fontFamily: 'monospace', color: '#888888' }
                    : { fontSize: '13px', fontFamily: 'monospace', color: '#d4d4d4' };
            },
            valueGetter: (params: ValueGetterParams<ConditionGroup>) => {
                if (this.isManipRowLocked(params.data as ConditionGroup)) return '*';
                return params.data?.field_manipulations?.[fieldName] || '';
            },
            valueSetter: (params: ValueSetterParams<ConditionGroup>) => {
                if (!params.data.field_manipulations) {
                    params.data.field_manipulations = {};
                }
                params.data.field_manipulations[fieldName] = params.newValue ?? '';
                return true;
            },
        };
    }

    private buildManipulationColDef(): ColDef {
        return {
            colId: 'manipulation',
            field: 'manipulation',
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: this.makeMenuHeaderParams('manipulation', 'Manipulation'),
            editable: false,
            flex: 1,
            cellRenderer: MonacoCellRendererComponent,
            cellStyle: { fontSize: '13px', fontFamily: 'monospace', color: '#d4d4d4' },
            valueSetter: (params: ValueSetterParams<ConditionGroup>) => {
                params.data.manipulation = params.newValue ?? '';
                return true;
            },
        };
    }

    private buildExpressionColDef(): ColDef {
        return {
            colId: 'expression',
            field: 'expression',
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: this.makeMenuHeaderParams('expression', 'Expression'),
            editable: false,
            flex: 1,
            cellRenderer: MonacoCellRendererComponent,
            rowSpan: (params: RowSpanParams<ConditionGroup>) =>
                this.getRowSpan(params, 'expression', (d) => d?.expression || ''),
            cellStyle: (params: RowSpanParams<ConditionGroup>) =>
                this.getSpanCellStyle(params, 'expression', (d) => d?.expression || '', {
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: '#d4d4d4',
                }),
            valueSetter: (params: ValueSetterParams<ConditionGroup>) => {
                const raw = params.newValue || '';
                params.data.expression = raw ? normalizeExpressionSpacing(raw) : '';
                return true;
            },
        };
    }

    private buildColumnDefs(): (ColDef | ColGroupDef)[] {
        const staticBefore: ColDef[] = [
            {
                headerName: 'Enabled',
                field: 'dock_visible',
                editable: true,
                width: 85,
                minWidth: 75,
                rowDrag: true,
                cellDataType: 'boolean',
                headerTooltip: 'Enabled',
                suppressMovable: true,
                cellStyle: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                },
            },
            {
                colId: 'group_name',
                headerComponent: ColumnHeaderMenuComponent,
                headerComponentParams: this.makeMenuHeaderParams('group_name', 'Condition Name'),
                field: 'group_name',
                editable: true,
                flex: 1,
                suppressMovable: true,
                cellStyle: {
                    fontSize: '14px',
                },
            },
        ];

        // Expression section
        const visibleFieldCols: ColDef[] = this.movableColumnOrder()
            .filter((id) => id.startsWith('field_'))
            .map((id) => this.buildFieldColDef(id.substring(6)));

        const hasFieldCols = visibleFieldCols.length > 0;
        const expressionCol = this.buildExpressionColDef();

        let exprSection: (ColDef | ColGroupDef)[];
        if (hasFieldCols) {
            exprSection = [
                expressionCol,
                {
                    groupId: 'expr-params-group',
                    marryChildren: false,
                    headerGroupComponent: ParamsGroupHeaderComponent,
                    headerGroupComponentParams: {
                        mode: 'full',
                        onAdd: (event: MouseEvent) => this.toggleFieldPicker(event),
                        onFreeze: () => {
                            const ids = visibleFieldCols.map((c) => c.colId!);
                            const allFrozen = ids.length > 0 && ids.every((id) => this.frozenColIds().has(id));
                            if (allFrozen) {
                                this.toggleFreeze(ids[0]);
                            } else {
                                this.freezeThroughLastChild(ids);
                            }
                        },
                        onHide: () => this.hideColumns(visibleFieldCols.map((c) => c.colId!)),
                        isPinned: () => {
                            const ids = visibleFieldCols.map((c) => c.colId!);
                            const frozen = this.frozenColIds();
                            return ids.length > 0 && ids.every((id) => frozen.has(id));
                        },
                    },
                    children: visibleFieldCols,
                } as ColGroupDef,
            ];
        } else {
            exprSection = [expressionCol];
        }

        const promptIdCol: ColDef = {
            colId: 'prompt_id',
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: this.makeMenuHeaderParams('prompt_id', 'Prompt ID'),
            field: 'prompt_id',
            suppressMovable: true,
            editable: true,
            width: 150,
            cellRenderer: PromptTooltipRendererComponent,
            cellRendererParams: () => ({
                prompts: this.prompts(),
                onPromptChange: (
                    promptId: string,
                    field: keyof PromptConfig,
                    value: PromptConfig[keyof PromptConfig]
                ) => {
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
                onPromptChange: (
                    promptId: string,
                    field: keyof PromptConfig,
                    value: PromptConfig[keyof PromptConfig]
                ) => {
                    this.promptChange.emit({ promptId, field, value });
                },
            }),
            cellEditorPopup: false,
            cellStyle: {
                fontSize: '14px',
            },
        };

        // Manipulation section
        const visibleManipCols: ColDef[] = this.manipColumnOrder()
            .filter((id) => id.startsWith('manip_'))
            .map((id) => this.buildManipFieldColDef(id.substring(6)));

        const hasManipCols = visibleManipCols.length > 0;
        const manipCol = this.buildManipulationColDef();

        let manipSection: (ColDef | ColGroupDef)[];
        if (hasManipCols) {
            manipSection = [
                manipCol,
                {
                    groupId: 'manip-params-group',
                    marryChildren: false,
                    headerGroupComponent: ParamsGroupHeaderComponent,
                    headerGroupComponentParams: {
                        mode: 'full',
                        onAdd: (event: MouseEvent) => this.toggleManipFieldPicker(event),
                        onFreeze: () => {
                            const ids = visibleManipCols.map((c) => c.colId!);
                            const allFrozen = ids.length > 0 && ids.every((id) => this.frozenColIds().has(id));
                            if (allFrozen) {
                                this.toggleFreeze(ids[0]);
                            } else {
                                this.freezeThroughLastChild(ids);
                            }
                        },
                        onHide: () => this.hideColumns(visibleManipCols.map((c) => c.colId!)),
                        isPinned: () => {
                            const ids = visibleManipCols.map((c) => c.colId!);
                            const frozen = this.frozenColIds();
                            return ids.length > 0 && ids.every((id) => frozen.has(id));
                        },
                    },
                    children: visibleManipCols,
                } as ColGroupDef,
            ];
        } else {
            manipSection = [manipCol];
        }

        const routeCodeCol: ColDef = {
            colId: 'route_code',
            headerComponent: ColumnHeaderMenuComponent,
            headerComponentParams: this.makeMenuHeaderParams('route_code', 'Route Code'),
            field: 'route_code',
            editable: true,
            width: 150,
            suppressMovable: true,
            cellStyle: {
                fontSize: '14px',
            },
        };

        const skipCol: ColDef = {
            headerName: 'Continue',
            field: 'continue_flag',
            editable: true,
            width: 65,
            minWidth: 50,
            cellDataType: 'boolean',
            suppressMovable: true,
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            },
        };

        const deleteCol: ColDef = {
            headerName: '',
            headerComponent: IconHeaderComponent,
            headerComponentParams: {
                iconClass: 'ti ti-trash',
                label: '',
                variant: 'delete',
            },
            field: 'actions',
            cellRenderer: () => {
                return `<i class="ti ti-x" style="color: rgba(255,255,255,0.5); font-size: 1rem; cursor: pointer;"></i>`;
            },
            width: 60,
            minWidth: 60,
            maxWidth: 60,
            suppressMovable: true,
            cellStyle: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
            },
            onCellClicked: (event: CellClickedEvent) => {
                this.deleteRow(event.node.rowIndex!);
            },
        };

        return [...staticBefore, ...exprSection, promptIdCol, ...manipSection, routeCodeCol, skipCol, deleteCol];
    }

    private getMergeableColIds(): string[] {
        return [...this.activeFieldColumns().map((f) => `field_${f}`), 'expression'];
    }

    // Returns the row range that column `colId` is allowed to merge within,
    // based on the left column's merge group hierarchy.
    private getHierarchicalBounds(
        params: RowSpanParams<ConditionGroup>,
        colId: string,
        idx: number
    ): { start: number; end: number } {
        const mergeableCols = this.getMergeableColIds();
        const colIndex = mergeableCols.indexOf(colId);

        if (colIndex <= 0) {
            // First column or not found — full table range
            return { start: 0, end: (params.api?.getDisplayedRowCount?.() ?? 1000) - 1 };
        }

        const leftColId = mergeableCols[colIndex - 1];
        // Recursively get the left column's own bounds
        const leftBounds = this.getHierarchicalBounds(params, leftColId, idx);

        const leftVal = this.getMergeableValueFromData(params.api?.getDisplayedRowAtIndex(idx)?.data, leftColId);

        let start = idx;
        while (start > leftBounds.start) {
            const prev = params.api?.getDisplayedRowAtIndex(start - 1);
            if (!prev || this.getMergeableValueFromData(prev.data, leftColId) !== leftVal) break;
            start--;
        }
        let end = idx;
        while (end < leftBounds.end) {
            const next = params.api?.getDisplayedRowAtIndex(end + 1);
            if (!next || this.getMergeableValueFromData(next.data, leftColId) !== leftVal) break;
            end++;
        }
        return { start, end };
    }

    private getRowSpan(
        params: RowSpanParams<ConditionGroup>,
        colId: string,
        getValue: (data: ConditionGroup | undefined) => string
    ): number {
        const idx = params.node?.rowIndex ?? 0;
        const ug = this.unmergedGroup();
        if (ug && ug.colId === colId && idx >= ug.startRow && idx <= ug.endRow) return 1;
        const cur = getValue(params.data) || '';
        if (!cur) return 1;

        const bounds = this.getHierarchicalBounds(params, colId, idx);

        // If this cell matches the one above (within bounds), AG Grid hides it behind the span above
        if (idx > bounds.start) {
            const prevNode = params.api?.getDisplayedRowAtIndex(idx - 1);
            if (prevNode && cur === (getValue(prevNode.data) || '')) {
                return 1;
            }
        }
        // Count consecutive matching rows below, bounded by hierarchy
        let span = 1;
        while (idx + span <= bounds.end) {
            const nextNode = params.api?.getDisplayedRowAtIndex(idx + span);
            if (!nextNode || cur !== (getValue(nextNode.data) || '')) break;
            span++;
        }
        return span;
    }

    private isCellMerged(params: RowSpanParams<ConditionGroup>, colId: string, idx: number): boolean {
        const ug = this.unmergedGroup();
        if (ug && ug.colId === colId && idx >= ug.startRow && idx <= ug.endRow) return false;
        const val = this.getMergeableValue(params, colId);

        const bounds = this.getHierarchicalBounds(params, colId, idx);
        const prevNode = idx > bounds.start ? params.api?.getDisplayedRowAtIndex(idx - 1) : null;
        const nextNode = idx < bounds.end ? params.api?.getDisplayedRowAtIndex(idx + 1) : null;
        return (
            !!(prevNode && val === this.getMergeableValueFromData(prevNode.data, colId)) ||
            !!(nextNode && val === this.getMergeableValueFromData(nextNode.data, colId))
        );
    }

    private getMergeableValue(params: RowSpanParams<ConditionGroup>, colId: string): string {
        return this.getMergeableValueFromData(params.data, colId);
    }

    private getMergeableValueFromData(data: ConditionGroup | undefined, colId: string): string {
        if (!data) return '';
        if (colId === 'expression') return data.expression || '';
        if (colId.startsWith('field_')) {
            const field = colId.substring(6);
            return data.field_expressions?.[field] || '';
        }
        if (colId.startsWith('manip_')) {
            const field = colId.substring(6);
            return data.field_manipulations?.[field] || '';
        }
        return '';
    }

    private static hashStr(s: string): number {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return h;
    }

    // ── NEW COLORING SYSTEM ──
    // Leftmost column: evenly spaced hues per group (including empty groups).
    // Next columns: blend parent hue with own value's hash hue.
    // Empty cells: inherit left color, no own hue contribution.
    // Non-merged non-empty cells: no color; breaks chain for columns to the right.
    // Color lightens going right.

    private getColumnGroupInfo(
        params: RowSpanParams<ConditionGroup>,
        colId: string
    ): { groupIdx: number; totalGroups: number } {
        const totalRows = params.api?.getDisplayedRowCount?.() ?? 0;
        const idx = params.node?.rowIndex ?? 0;
        let groupIdx = 0;
        let totalGroups = 0;
        let prevVal: string | null = null;
        for (let r = 0; r < totalRows; r++) {
            const node = params.api?.getDisplayedRowAtIndex(r);
            const val = node ? this.getMergeableValueFromData(node.data, colId) : '';
            if (prevVal === null || val !== prevVal) {
                totalGroups++;
                if (r <= idx) groupIdx = totalGroups - 1;
            }
            prevVal = val;
        }
        return { groupIdx, totalGroups };
    }

    private computeCellBg(params: RowSpanParams<ConditionGroup>, colId: string, idx: number): string {
        const mergeableCols = this.getMergeableColIds();
        const colIndex = mergeableCols.indexOf(colId);
        if (colIndex < 0) return '';

        let hue = 0;
        let depth = 0;

        for (let i = 0; i <= colIndex; i++) {
            const col = mergeableCols[i];
            const val = this.getMergeableValue(params, col);
            const merged = this.isCellMerged(params, col, idx);

            // Non-merged non-empty cell: no color, breaks chain
            if (val !== '' && !merged) return '';

            if (i === 0) {
                // Leftmost column: evenly spaced hues for all groups (including empty)
                const info = this.getColumnGroupInfo(params, col);
                hue = info.totalGroups > 1 ? (info.groupIdx * 360) / info.totalGroups : 200; // single-group fallback
                depth++;
            } else if (val !== '') {
                // Non-leftmost with value: blend parent hue with value hash
                const valHash = ClassificationDecisionTableGridComponent.hashStr(val);
                const valHue = ((Math.abs(valHash) * 0.618033988749895) % 1) * 360;
                hue = hue * 0.6 + valHue * 0.4; // weighted blend toward parent
                depth++;
            }
            // Empty non-leftmost: just inherit (hue unchanged, depth unchanged)
        }

        // Lightens going right: saturation decreases, lightness increases
        const sat = Math.max(18 - depth * 2, 6);
        const lit = Math.min(13 + depth * 2, 22);
        return `hsl(${((hue % 360) + 360) % 360}, ${sat}%, ${lit}%)`;
    }

    private getSpanCellStyle(
        params: RowSpanParams<ConditionGroup>,
        colId: string,
        getValue: (data: ConditionGroup | undefined) => string,
        baseStyle: Record<string, string>
    ): Record<string, string> {
        const style: Record<string, string> = { ...baseStyle };
        const idx = params.node?.rowIndex ?? 0;
        const ug = this.unmergedGroup();
        if (ug && ug.colId === colId && idx >= ug.startRow && idx <= ug.endRow) return style;
        const cur = getValue(params.data) || '';

        const bounds = this.getHierarchicalBounds(params, colId, idx);
        const prevNode = idx > bounds.start ? params.api?.getDisplayedRowAtIndex(idx - 1) : null;
        const nextNode = idx < bounds.end ? params.api?.getDisplayedRowAtIndex(idx + 1) : null;
        const matchesAbove = prevNode ? cur === (getValue(prevNode.data) || '') : false;
        const matchesBelow = nextNode ? cur === (getValue(nextNode.data) || '') : false;
        const isMerged = matchesAbove || matchesBelow;

        // Compute background color
        const bg = this.computeCellBg(params, colId, idx);
        if (bg) {
            style['backgroundColor'] = bg;
        }

        // Merged cell layout
        if (isMerged) {
            style['display'] = 'flex';
            style['alignItems'] = 'center';
        }

        // Separator border at top of spanning cell (group boundary)
        // For empty cells: also add border when this is the first row of the hierarchical bounds
        // (group boundary even if the cell above is also empty but in a different parent group)
        const isGroupStart = !matchesAbove && matchesBelow;
        const isEmptyBoundsStart = cur === '' && isMerged && idx === bounds.start && idx > 0;
        if (isGroupStart || isEmptyBoundsStart) {
            style['borderTop'] = '2px solid rgba(255, 255, 255, 0.18)';
        }
        return style;
    }

    private findMergeGroup(colId: string, rowIndex: number): { startRow: number; endRow: number } {
        const rows = this.rowData();
        const getVal = (i: number): string => this.getMergeableValueFromData(rows[i], colId);

        const val = getVal(rowIndex);
        if (!val) return { startRow: rowIndex, endRow: rowIndex };

        // Respect hierarchical bounds from left columns
        const mergeableCols = this.getMergeableColIds();
        const colIdx = mergeableCols.indexOf(colId);
        let boundsStart = 0;
        let boundsEnd = rows.length - 1;

        if (colIdx > 0) {
            const leftColId = mergeableCols[colIdx - 1];
            const leftGroup = this.findMergeGroup(leftColId, rowIndex);
            boundsStart = leftGroup.startRow;
            boundsEnd = leftGroup.endRow;
        }

        let start = rowIndex;
        while (start > boundsStart && getVal(start - 1) === val) start--;
        let end = rowIndex;
        while (end < boundsEnd && getVal(end + 1) === val) end++;
        return { startRow: start, endRow: end };
    }

    private applyWidths(defs: (ColDef | ColGroupDef)[], widthMap: Map<string, number>): (ColDef | ColGroupDef)[] {
        return defs.map((def) => {
            if ('children' in def) {
                return {
                    ...def,
                    children: this.applyWidths((def as ColGroupDef).children as (ColDef | ColGroupDef)[], widthMap),
                };
            }
            const col = def as ColDef;
            const id = col.colId || col.field;
            if (id && widthMap.has(id)) {
                return { ...col, flex: undefined, width: widthMap.get(id) };
            }
            return col;
        });
    }

    private rebuildColumnDefs(): void {
        // Start from current grid state (live resizes), then fill in saved widths for columns not yet in grid
        const widthMap = new Map<string, number>();
        this.gridApi?.getColumnState()?.forEach((s) => {
            if (s.colId && s.width) widthMap.set(s.colId, s.width);
        });
        // savedColumnWidths fills in columns not yet reflected in grid state (e.g. on initial load)
        this.savedColumnWidths.forEach((w, id) => {
            if (!widthMap.has(id)) widthMap.set(id, w);
        });

        this.columnDefs = this.buildColumnDefs();

        if (widthMap.size > 0) {
            this.columnDefs = this.applyWidths(this.columnDefs, widthMap) as (ColDef | ColGroupDef)[];
        }

        if (this.gridApi) {
            this.isRebuilding = true;
            this.gridApi.setGridOption('columnDefs', this.columnDefs);
            this.isRebuilding = false;

            // Re-apply hidden/frozen state after rebuild
            this.reapplyColumnState();
        }
        setTimeout(() => this.updateAddButtonPositions(), 50);
    }

    /**
     * Syncs param cells from parsed expressions for every row.
     * Runs whenever activeFieldColumns() changes (i.e. a column is added, removed or
     * reordered) so that rows whose expression was typed before a column existed get
     * their new cell populated immediately.
     *
     * - ok:true  → for each active column: write parsed.parts[name] if present, '' otherwise.
     *              Expression is treated as source of truth for parseable rows.
     * - ok:false → leave field_expressions untouched (locked row).
     * - Empty expression → skip the row entirely (nothing to parse).
     */
    private syncRowsFromExpression(): void {
        untracked(() => {
            const rows = this.rowData();
            const activeNames = this.activeFieldColumns();
            if (rows.length === 0 || activeNames.length === 0) return;

            this.isSyncing = true;
            try {
                rows.map((row) => ({ row, expr: (row.expression ?? '').trim() }))
                    .filter(({ expr }) => !!expr)
                    .map(({ row, expr }) => ({ row, parsed: parseExpression(expr) }))
                    .filter(({ parsed }) => parsed.ok)
                    .forEach(({ row, parsed }) => {
                        row.field_expressions ??= {};
                        activeNames.forEach((name) => {
                            row.field_expressions![name] = parsed.parts[name] ?? '';
                        });
                    });

                // Rows are mutated in place — no rowData.set needed.
                // refreshCells tells ag-grid to re-render without touching Angular signals.
                this.gridApi?.refreshCells({ force: true });
            } finally {
                this.isSyncing = false;
            }
        });
    }

    private syncRowsFromManipulation(): void {
        untracked(() => {
            const rows = this.rowData();
            const activeNames = this.activeManipFieldColumns();
            if (rows.length === 0 || activeNames.length === 0) return;

            this.isSyncing = true;
            try {
                rows.map((row) => ({ row, manip: (row.manipulation ?? '').trim() }))
                    .filter(({ manip }) => !!manip)
                    .map(({ row, manip }) => ({ row, parsed: parseManipulation(manip) }))
                    .filter(({ parsed }) => parsed.ok)
                    .forEach(({ row, parsed }) => {
                        row.field_manipulations ??= {};
                        activeNames.forEach((name) => {
                            row.field_manipulations![name] = parsed.parts[name] ?? '';
                        });
                    });
                this.gridApi?.refreshCells({ force: true });
            } finally {
                this.isSyncing = false;
            }
        });
    }

    /** Re-applies the stored pinned/hidden state to the live grid after a column defs rebuild. */
    private reapplyColumnState(): void {
        const frozen = this.frozenColIds();
        const hidden = this.hiddenColIds();
        if (frozen.size === 0 && hidden.size === 0) return;

        const stateUpdates: { colId: string; pinned?: 'left' | null; hide?: boolean }[] = [];

        frozen.forEach((colId) => stateUpdates.push({ colId, pinned: 'left' }));
        hidden.forEach((colId) => stateUpdates.push({ colId, hide: true }));

        this.gridApi.applyColumnState({ state: stateUpdates });
        setTimeout(() => this.updateBadgePositions(), 50);
    }

    private updateAddButtonPositions(): void {
        if (this.hasFieldCols()) {
            this.exprAddPos.set(null);
        } else {
            const exprCell = this.elRef.nativeElement.querySelector('.ag-header-cell[col-id="expression"]');
            if (exprCell) {
                const rect = (exprCell as HTMLElement).getBoundingClientRect();
                this.exprAddPos.set({ x: rect.right - 26, y: rect.top + rect.height / 2 - 10 });
            }
        }

        if (this.hasManipCols()) {
            this.manipAddPos.set(null);
        } else {
            const manipCell = this.elRef.nativeElement.querySelector('.ag-header-cell[col-id="manipulation"]');
            if (manipCell) {
                const rect = (manipCell as HTMLElement).getBoundingClientRect();
                this.manipAddPos.set({ x: rect.right - 26, y: rect.top + rect.height / 2 - 10 });
            }
        }

        // Also update badge positions whenever buttons are updated
        this.updateBadgePositions();
    }

    toggleFieldPicker(event?: MouseEvent): void {
        this.exprSelectedFieldsModel.set([...this.activeFieldColumns()]);
        const anchor = (event?.currentTarget ?? event?.target) as HTMLElement | undefined;
        if (anchor) {
            this.exprMultiSelect.openAt(anchor);
        } else {
            this.exprMultiSelect.openDropdown();
        }
    }

    addFieldColumn(fieldName: string): void {
        const colId = `field_${fieldName}`;
        const order = this.movableColumnOrder();
        if (!order.includes(colId)) {
            this.movableColumnOrder.set([...order, colId]);
        }
        this.saveGridState();
    }

    removeFieldColumn(fieldName: string): void {
        const colId = `field_${fieldName}`;
        this.movableColumnOrder.set(this.movableColumnOrder().filter((id) => id !== colId));
        this.saveGridState();
    }

    onExprSelectionChange(values: unknown[]): void {
        const newSet = new Set(values as string[]);
        const currentSet = new Set(this.activeFieldColumns());
        // Newly checked → add
        for (const name of newSet) {
            if (!currentSet.has(name)) this.addFieldColumn(name);
        }
        // Newly unchecked → remove
        for (const name of currentSet) {
            if (!newSet.has(name)) this.removeFieldColumn(name);
        }
    }

    toggleManipFieldPicker(event?: MouseEvent): void {
        this.manipSelectedFieldsModel.set([...this.activeManipFieldColumns()]);
        const anchor = (event?.currentTarget ?? event?.target) as HTMLElement | undefined;
        if (anchor) {
            this.manipMultiSelect.openAt(anchor);
        } else {
            this.manipMultiSelect.openDropdown();
        }
    }

    addManipFieldColumn(fieldName: string): void {
        const colId = `manip_${fieldName}`;
        const order = this.manipColumnOrder();
        if (!order.includes(colId)) {
            this.manipColumnOrder.set([...order, colId]);
        }
        this.saveGridState();
    }

    removeManipFieldColumn(fieldName: string): void {
        const colId = `manip_${fieldName}`;
        this.manipColumnOrder.set(this.manipColumnOrder().filter((id) => id !== colId));
        this.saveGridState();
    }

    onManipSelectionChange(values: unknown[]): void {
        const newSet = new Set(values as string[]);
        const currentSet = new Set(this.activeManipFieldColumns());
        // Newly checked → add
        for (const name of newSet) {
            if (!currentSet.has(name)) this.addManipFieldColumn(name);
        }
        // Newly unchecked → remove
        for (const name of currentSet) {
            if (!newSet.has(name)) this.removeManipFieldColumn(name);
        }
    }

    onGridReady(params: GridReadyEvent): void {
        this.gridApi = params.api;
        this.setupBodyClickListener();
        this.setupOutsideClickListener();
        // Apply saved column widths after grid is ready
        if (this.savedColumnWidths.size > 0) {
            const colState = this.gridApi.getColumnState().map((s) => {
                const saved = s.colId ? this.savedColumnWidths.get(s.colId) : undefined;
                return saved ? { ...s, width: saved } : s;
            });
            this.gridApi.applyColumnState({ state: colState });
        }
        // Apply saved frozen/hidden state
        this.reapplyColumnState();
        setTimeout(() => this.updateAddButtonPositions(), 100);
        this.positionResizeObserver = new ResizeObserver(() => this.updateAddButtonPositions());
        this.positionResizeObserver.observe(this.elRef.nativeElement);
    }

    private bodyClickHandler = (event: MouseEvent) => {
        // Close context menu on any click
        if (this.contextMenu()) {
            this.contextMenu.set(null);
        }

        const currentUnmerged = this.unmergedGroup();
        const target = event.target as HTMLElement;

        // Don't act if clicking inside a Monaco tooltip popover, AG Grid header, or field controls
        if (target?.closest('.code-tooltip-popover')) return;
        if (target?.closest('.ag-header')) return;
        if (target?.closest('.field-column-controls')) return;

        // Check if the click landed on an AG Grid cell and extract its col-id
        const cellEl = target?.closest('[col-id]') as HTMLElement | null;
        const clickedColId = cellEl?.getAttribute('col-id') || null;

        if (clickedColId) {
            // Click is on a grid cell
            const isMergeableCol = clickedColId === 'expression' || clickedColId.startsWith('field_');

            if (isMergeableCol && (!currentUnmerged || currentUnmerged.colId !== clickedColId)) {
                // Only unmerge if the cell is actually spanning multiple rows
                const rowSpan = parseInt(cellEl!.getAttribute('rowspan') || '1', 10);
                if (rowSpan <= 1) return;

                // Determine which row was clicked within a spanned cell
                const rowHeight = this.gridOptions.rowHeight || 50;
                const cellRect = cellEl!.getBoundingClientRect();
                const rowOffset = Math.floor((event.clientY - cellRect.top) / rowHeight);
                const rowEl = cellEl!.closest('.ag-row');
                const topRowIndex = parseInt(rowEl?.getAttribute('row-index') || '0', 10);
                const targetRowIndex = topRowIndex + rowOffset;

                // Find merge group boundaries for this cell
                const groupRange = this.findMergeGroup(clickedColId, topRowIndex);

                // Unmerge only this group
                this.unmergedGroup.set({ colId: clickedColId, ...groupRange });
                this.rebuildColumnDefs();

                // After re-render, trigger editor on the target row's cell
                setTimeout(() => {
                    const targetCell = this.elRef.nativeElement.querySelector(
                        `.ag-row[row-index="${targetRowIndex}"] [col-id="${clickedColId}"] .code-cell`
                    );
                    if (targetCell) {
                        targetCell.click();
                    }
                }, 100);
            } else if (!isMergeableCol && currentUnmerged) {
                // Clicked a non-mergeable column → re-merge
                this.unmergedGroup.set(null);
                this.rebuildColumnDefs();
            }
        } else if (currentUnmerged) {
            // Click is outside any grid cell → re-merge
            this.unmergedGroup.set(null);
            this.rebuildColumnDefs();
        }
    };

    private setupBodyClickListener(): void {
        document.addEventListener('click', this.bodyClickHandler);
    }

    private setupOutsideClickListener(): void {
        this.outsideClickUnlisten = this.renderer.listen('document', 'pointerdown', (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            const gridRoot = this.elRef.nativeElement as HTMLElement;
            // Click was inside the grid — keep focus
            if (gridRoot.contains(target)) return;
            // Click was inside an ag-grid popup rendered to document body (dropdowns, menus)
            const path = (event.composedPath?.() ?? []) as HTMLElement[];
            const inAgPopup = path.some(
                (el) => el?.classList?.contains?.('ag-popup') || el?.classList?.contains?.('ag-popup-child')
            );
            if (inAgPopup) return;
            // Clear focused cell so the purple border disappears
            this.gridApi?.clearFocusedCell();
        });
    }

    ngOnDestroy(): void {
        document.removeEventListener('click', this.bodyClickHandler);
        this.outsideClickUnlisten?.();
        this.positionResizeObserver?.disconnect();
    }

    /**
     * Returns true iff the row has a non-empty expression that cannot be decomposed
     * into per-variable AND clauses by parseExpression.
     */
    public isRowLocked(rowData: ConditionGroup): boolean {
        const expr = rowData?.expression?.trim();
        if (!expr) return false;
        // Lock only when the expression is syntactically unparseable — not when it
        // references a variable that happens to not be an active param column.
        const result = parseExpression(expr);
        return !result.ok;
    }

    /**
     * Returns true iff the row has a non-empty manipulation that cannot be decomposed
     * into per-variable assignment statements by parseManipulation.
     */
    public isManipRowLocked(rowData: ConditionGroup): boolean {
        const manip = (rowData?.manipulation ?? '').trim();
        if (!manip) return false;
        return !parseManipulation(manip).ok;
    }

    onCellValueChanged(event: CellValueChangedEvent): void {
        // Guard against recursive loops triggered by programmatic cell writes
        if (this.isSyncing) return;

        const colId: string = event.colDef.colId ?? '';
        const rowData = event.data as ConditionGroup;
        const activeNames = this.activeFieldColumns();
        const activeManipNames = this.activeManipFieldColumns();

        if (colId === 'expression') {
            // Expression → params sync
            const newExpr: string = (rowData.expression ?? '').trim();

            this.isSyncing = true;
            try {
                if (!rowData.field_expressions) {
                    rowData.field_expressions = {};
                }

                if (!newExpr) {
                    // Empty expression → clear all active param cells
                    for (const name of activeNames) {
                        rowData.field_expressions[name] = '';
                    }
                } else {
                    // Parse without knownVarNames — validity is purely syntactic now.
                    const parsed = parseExpression(newExpr);
                    if (parsed.ok) {
                        // Write parsed parts only for active columns; clear active
                        // names not present in the parsed result. Parts that reference
                        // variables not in activeNames are silently ignored (the data
                        // stays in the expression cell but no column is auto-created).
                        for (const name of activeNames) {
                            rowData.field_expressions[name] = parsed.parts[name] ?? '';
                        }
                    }
                    // ok:false → leave field_expressions untouched (locked state)
                }

                this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
            } finally {
                this.isSyncing = false;
            }
        } else if (colId.startsWith('field_')) {
            // Params → expression sync
            if (this.isRowLocked(rowData)) {
                // Locked row — don't recompose; the param cells should not be editable anyway
                this.isSyncing = true;
                try {
                    this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
                } finally {
                    this.isSyncing = false;
                }
            } else {
                // Recompose expression from all active field_expressions
                const currentParts: Record<string, string> = {};
                for (const name of activeNames) {
                    currentParts[name] = rowData.field_expressions?.[name]?.trim() ?? '';
                }

                const newExpr = composeExpression(currentParts, activeNames);

                this.isSyncing = true;
                try {
                    rowData.expression = newExpr || null;
                    this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
                } finally {
                    this.isSyncing = false;
                }
            }
        } else if (colId === 'manipulation') {
            // Manipulation → manip params sync
            const newManip: string = (rowData.manipulation ?? '').trim();

            this.isSyncing = true;
            try {
                if (!rowData.field_manipulations) {
                    rowData.field_manipulations = {};
                }

                if (!newManip) {
                    // Empty manipulation → clear all active manip param cells
                    for (const name of activeManipNames) {
                        rowData.field_manipulations[name] = '';
                    }
                } else {
                    const parsed = parseManipulation(newManip);
                    if (parsed.ok) {
                        // Write parsed parts only for active columns; clear active
                        // names not present in the parsed result.
                        for (const name of activeManipNames) {
                            rowData.field_manipulations[name] = parsed.parts[name] ?? '';
                        }
                    }
                    // ok:false → leave field_manipulations untouched (locked state)
                }

                this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
            } finally {
                this.isSyncing = false;
            }
        } else if (colId.startsWith('manip_')) {
            // Manip params → manipulation sync
            if (this.isManipRowLocked(rowData)) {
                // Locked row — don't recompose; the manip param cells should not be editable anyway
                this.isSyncing = true;
                try {
                    this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
                } finally {
                    this.isSyncing = false;
                }
            } else {
                // Recompose manipulation from all active field_manipulations
                const currentParts: Record<string, string> = {};
                for (const name of activeManipNames) {
                    currentParts[name] = rowData.field_manipulations?.[name]?.trim() ?? '';
                }

                const newManip = composeManipulation(currentParts, activeManipNames);

                this.isSyncing = true;
                try {
                    rowData.manipulation = newManip || null;
                    this.gridApi?.refreshCells({ rowNodes: [event.node!], force: true });
                } finally {
                    this.isSyncing = false;
                }
            }
        }

        this.unmergedGroup.set(null);
        const updatedRows = this.getUpdatedRows();
        this.emitChanges(updatedRows);
        this.rebuildColumnDefs();
    }

    private createNewRow(index: number): ConditionGroup {
        const fieldExpressions: Record<string, string> = {};
        this.activeFieldColumns().forEach((f) => (fieldExpressions[f] = ''));
        return {
            group_name: `Condition ${index + 1}`,
            group_type: 'complex',
            expression: null,
            conditions: [],
            manipulation: null,
            continue_flag: false,
            route_code: '',
            dock_visible: true,
            next_node: null,
            order: index + 1,
            field_expressions: fieldExpressions,
        };
    }

    addRow(): void {
        const currentRows = this.rowData();
        const newRow = this.createNewRow(currentRows.length);
        this.rowData.set([...currentRows, newRow]);
        this.emitChanges([...currentRows, newRow]);
    }

    addRowAbove(): void {
        this.insertRowAtContext(0);
    }
    addRowBelow(): void {
        this.insertRowAtContext(1);
    }

    private insertRowAtContext(offset: 0 | 1): void {
        const ctx = this.contextMenu();
        if (!ctx) return;
        const currentRows = this.rowData();
        const insertAt = ctx.rowIndex + offset;
        const newRow = this.createNewRow(insertAt);
        const updated = [...currentRows.slice(0, insertAt), newRow, ...currentRows.slice(insertAt)].map((r, i) => ({
            ...r,
            order: i + 1,
        }));
        this.rowData.set(updated);
        this.emitChanges(updated);
        this.contextMenu.set(null);
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
