import { ChangeDetectionStrategy, Component, computed, input, OnInit, output, signal } from '@angular/core';

import { TableRow } from '../../../../../../shared/components/dynamic-table/dynamic-table.models';
import {
    rowDataToVariable,
    ToolVariable,
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
}
