import { CdkDragDrop } from '@angular/cdk/drag-drop';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    OnInit,
    output,
    signal,
    viewChildren,
} from '@angular/core';

import { TableRow } from '../../../../../../shared/components/dynamic-table/dynamic-table.models';
import {
    rowDataToVariable,
    ToolVariable,
    validateVariablesTree,
    VARIABLE_SECTIONS,
    VariableInputType,
    variableToRowData,
} from '../parameters-table.config';
import { VariableSectionComponent } from '../variable-section/variable-section.component';
import { BreadcrumbItem, VariablesBreadcrumbComponent } from '../variables-breadcrumb/variables-breadcrumb.component';

interface DrillStep {
    sectionType: VariableInputType;
    rowIndex: number;
    label: string;
}

@Component({
    selector: 'app-parameters-table-view',
    imports: [VariablesBreadcrumbComponent, VariableSectionComponent],
    templateUrl: './parameters-table-view.component.html',
    styleUrls: ['./parameters-table-view.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParametersTableViewComponent implements OnInit {
    variables = input.required<ToolVariable[]>();
    variablesChange = output<ToolVariable[]>();

    readonly VARIABLE_SECTIONS = VARIABLE_SECTIONS;

    /** Stable ids for `cdkDropList` on parameter tables (cross-section row drag). */
    readonly parameterRowDropConnectedIds = ['ptv-user', 'ptv-agent', 'ptv-mixed'] as const;

    readonly parameterRowSyncRevision = signal(0);

    private readonly sectionRefs = viewChildren(VariableSectionComponent);

    private readonly userVariables = signal<ToolVariable[]>([]);
    private readonly agentVariables = signal<ToolVariable[]>([]);
    private readonly mixedVariables = signal<ToolVariable[]>([]);

    private readonly drillStack = signal<DrillStep[]>([]);

    public readonly crumbs = computed<BreadcrumbItem[]>(() => {
        const stack = this.drillStack();
        return [{ icon: 'home', label: '' }, ...stack.map((step) => ({ icon: 'brackets', label: step.label }))];
    });

    public readonly isDrilling = computed(() => this.drillStack().length > 0);

    public readonly currentSectionType = computed<VariableInputType | null>(() => {
        const stack = this.drillStack();
        return stack.length > 0 ? stack[0].sectionType : null;
    });

    public readonly currentDrillSectionConfig = computed(() => {
        const sectionType = this.currentSectionType();
        return sectionType ? this.getSectionConfig(sectionType) : null;
    });

    public readonly currentDrillRows = computed<Record<string, unknown>[]>(() =>
        this.getVariablesAtPath(this.currentSectionType(), this.drillPath()).map(variableToRowData)
    );

    private readonly drillPath = computed<number[]>(() => this.drillStack().map((step) => step.rowIndex));

    public readonly externalDuplicatesByType = computed<Record<VariableInputType, Map<string, Set<string>>>>(() => {
        const userNames = this.collectNames(this.userVariables());
        const agentNames = this.collectNames(this.agentVariables());
        const mixedNames = this.collectNames(this.mixedVariables());

        return {
            user_input: new Map([['name', this.unionSets(agentNames, mixedNames)]]),
            agent_input: new Map([['name', this.unionSets(userNames, mixedNames)]]),
            mixed: new Map([['name', this.unionSets(userNames, agentNames)]]),
        };
    });

    validate(): void {
        for (const section of this.sectionRefs()) {
            section.validate();
        }
    }

    isValid(): boolean {
        // 1. Visible-cell check (so red borders / inline errors stay accurate).
        if (!this.sectionRefs().every((section) => section.isValid())) {
            return false;
        }

        // 2. Walk the entire data model (including invisible nested children
        //    after a drill-out) and re-check name validity + sibling uniqueness.
        const user = this.userVariables();
        const agent = this.agentVariables();
        const mixed = this.mixedVariables();
        if (!validateVariablesTree(user) || !validateVariablesTree(agent) || !validateVariablesTree(mixed)) {
            return false;
        }

        // 3. Top-level names must be unique across all 3 sections combined.
        const topNames = [...user, ...agent, ...mixed].map((v) => v.name?.trim()).filter(Boolean) as string[];
        if (new Set(topNames).size !== topNames.length) {
            return false;
        }

        return true;
    }

    ngOnInit(): void {
        const source = this.variables();
        this.userVariables.set(source.filter((v) => v.input_type === 'user_input'));
        this.agentVariables.set(source.filter((v) => v.input_type === 'agent_input'));
        this.mixedVariables.set(source.filter((v) => v.input_type === 'mixed'));
        this.drillStack.set([]);
    }

    getSectionInitialRows(type: VariableInputType): Record<string, unknown>[] {
        return this.getSectionVariables(type).map(variableToRowData);
    }

    onSectionRowsChange(type: VariableInputType, rows: Record<string, unknown>[]): void {
        this.setSectionVariables(
            type,
            rows.map((data) => rowDataToVariable(data, type))
        );
        this.emitAll();
    }

    parameterRowDropListId(type: VariableInputType): string | null {
        return this.isDrilling() ? null : this.parameterDropIdForType(type);
    }

    parameterRowDropConnectedTo(): string[] {
        return this.isDrilling() ? [] : [...this.parameterRowDropConnectedIds];
    }

    onCrossListDrop(event: CdkDragDrop<TableRow[]>): void {
        const sourceType = this.dropListElementIdToInputType(event.previousContainer.id);
        const targetType = this.dropListElementIdToInputType(event.container.id);
        if (!sourceType || !targetType || sourceType === targetType) {
            return;
        }

        const previousIndex = event.previousIndex;
        const currentIndex = event.currentIndex;

        const sourceVars = [...this.getSectionVariables(sourceType)];
        const targetVars = [...this.getSectionVariables(targetType)];

        if (previousIndex < 0 || previousIndex >= sourceVars.length) {
            return;
        }
        if (currentIndex < 0 || currentIndex > targetVars.length) {
            return;
        }

        const [moved] = sourceVars.splice(previousIndex, 1);
        const transformed = this.applyVariableTargetSection(moved, targetType);
        targetVars.splice(currentIndex, 0, transformed);

        this.setSectionVariables(sourceType, sourceVars);
        this.setSectionVariables(targetType, targetVars);
        this.parameterRowSyncRevision.update((n) => n + 1);
        this.emitAll();
    }

    onNavigate(event: { row: TableRow; rowIndex: number; sectionType: VariableInputType }): void {
        const label = String(event.row.data['name'] ?? 'Object');
        this.drillStack.update((stack) => [
            ...stack,
            {
                sectionType: stack.length > 0 ? stack[0].sectionType : event.sectionType,
                rowIndex: event.rowIndex,
                label,
            },
        ]);
    }

    onCrumbClick(index: number): void {
        if (index === 0) {
            this.drillStack.set([]);
            return;
        }

        this.drillStack.update((stack) => stack.slice(0, index));
    }

    onDrillRowsChange(rows: Record<string, unknown>[]): void {
        const sectionType = this.currentSectionType();
        if (!sectionType) {
            return;
        }

        const nextChildren = rows.map((data) => rowDataToVariable(data, sectionType));
        const path = this.drillPath();
        const roots = this.getSectionVariables(sectionType);
        const updatedRoots = this.setChildrenAtPath(roots, path, nextChildren);
        this.setSectionVariables(sectionType, updatedRoots);

        this.emitAll();
    }

    private getSectionVariables(type: VariableInputType): ToolVariable[] {
        switch (type) {
            case 'user_input':
                return this.userVariables();
            case 'agent_input':
                return this.agentVariables();
            case 'mixed':
                return this.mixedVariables();
        }
    }

    private setSectionVariables(type: VariableInputType, vars: ToolVariable[]): void {
        switch (type) {
            case 'user_input':
                this.userVariables.set(vars);
                break;
            case 'agent_input':
                this.agentVariables.set(vars);
                break;
            case 'mixed':
                this.mixedVariables.set(vars);
                break;
        }
    }

    private getSectionConfig(type: VariableInputType) {
        return VARIABLE_SECTIONS.find((section) => section.inputType === type) ?? null;
    }

    private getVariablesAtPath(sectionType: VariableInputType | null, path: number[]): ToolVariable[] {
        if (!sectionType || path.length === 0) {
            return [];
        }

        let cursor = this.getSectionVariables(sectionType);

        for (const index of path) {
            const target = cursor[index];
            if (!target || target.type !== 'object') {
                return [];
            }
            cursor = Array.isArray(target.children) ? target.children : [];
        }

        return cursor;
    }

    private setChildrenAtPath(vars: ToolVariable[], path: number[], nextChildren: ToolVariable[]): ToolVariable[] {
        if (path.length === 0) {
            return vars;
        }

        const [index, ...rest] = path;

        return vars.map((variable, currentIndex) => {
            if (currentIndex !== index) {
                return variable;
            }

            const currentChildren = Array.isArray(variable.children) ? variable.children : [];
            if (rest.length === 0) {
                return { ...variable, children: nextChildren };
            }

            return {
                ...variable,
                children: this.setChildrenAtPath(currentChildren, rest, nextChildren),
            };
        });
    }

    private emitAll(): void {
        this.variablesChange.emit([...this.userVariables(), ...this.agentVariables(), ...this.mixedVariables()]);
    }

    private parameterDropIdForType(type: VariableInputType): string {
        switch (type) {
            case 'user_input':
                return 'ptv-user';
            case 'agent_input':
                return 'ptv-agent';
            case 'mixed':
                return 'ptv-mixed';
        }
    }

    private dropListElementIdToInputType(id: string): VariableInputType | null {
        switch (id) {
            case 'ptv-user':
                return 'user_input';
            case 'ptv-agent':
                return 'agent_input';
            case 'ptv-mixed':
                return 'mixed';
            default:
                return null;
        }
    }

    private applyVariableTargetSection(variable: ToolVariable, target: VariableInputType): ToolVariable {
        return {
            ...variable,
            input_type: target,
            required: target === 'agent_input',
        };
    }

    private collectNames(vars: ToolVariable[]): Set<string> {
        const names = new Set<string>();
        for (const v of vars) {
            const name = v.name?.trim();
            if (name) names.add(name);
        }
        return names;
    }

    private unionSets(a: Set<string>, b: Set<string>): Set<string> {
        const result = new Set<string>(a);
        for (const v of b) result.add(v);
        return result;
    }
}
