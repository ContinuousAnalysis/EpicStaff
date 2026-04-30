import { TableColumnDef } from '../../../../../shared/components/dynamic-table/dynamic-table.models';

export type VariableInputType = 'user_input' | 'agent_input' | 'mixed';

export interface VariableSectionConfig {
    inputType: VariableInputType;
    label: string;
    icon: string;
    columnDefs: TableColumnDef[];
}

const TYPE_OPTIONS = [
    { label: 'string', value: 'string' },
    { label: 'integer', value: 'integer' },
    { label: 'number', value: 'number' },
    { label: 'boolean', value: 'boolean' },
    { label: 'array', value: 'array' },
    { label: 'object', value: 'object' },
    { label: 'any', value: 'any' },
];

export const USER_INPUT_COLUMN_DEFS = [
    { key: 'name', header: 'Name', type: 'input', width: '140px', placeholder: 'variable_name' },
    { key: 'type', header: 'Type', type: 'select', width: '120px', options: TYPE_OPTIONS },
    { key: 'default_value', header: 'Value', type: 'input', placeholder: 'null' },
    { key: 'description', header: 'Description', type: 'input', placeholder: 'What this variable is for' },
] satisfies TableColumnDef[];

export const AGENT_INPUT_COLUMN_DEFS = [
    { key: 'name', header: 'Name', type: 'input', width: '140px', placeholder: 'variable_name' },
    { key: 'type', header: 'Type', type: 'select', width: '120px', options: TYPE_OPTIONS },
    { key: 'default_value', header: 'Default Value', type: 'input', placeholder: 'null' },
    { key: 'description', header: 'Description', type: 'input', placeholder: 'What this variable is for' },
    { key: 'required', header: 'Required', type: 'checkbox', width: '80px' },
] satisfies TableColumnDef[];

export const MIXED_COLUMN_DEFS = [
    { key: 'name', header: 'Name', type: 'input', width: '140px', placeholder: 'variable_name' },
    { key: 'type', header: 'Type', type: 'select', width: '120px', options: TYPE_OPTIONS },
    { key: 'default_value', header: 'Default Value', type: 'input', placeholder: 'null' },
    { key: 'description', header: 'Description', type: 'input', placeholder: 'What this variable is for' },
] satisfies TableColumnDef[];

export const VARIABLE_SECTIONS = [
    { inputType: 'user_input', label: 'User Input', icon: 'user', columnDefs: USER_INPUT_COLUMN_DEFS },
    { inputType: 'agent_input', label: 'Agent Input', icon: 'agent', columnDefs: AGENT_INPUT_COLUMN_DEFS },
    {
        inputType: 'mixed',
        label: 'User Input otherwise Input by Agent',
        icon: 'mixed-input',
        columnDefs: MIXED_COLUMN_DEFS,
    },
] as const satisfies readonly VariableSectionConfig[];

export interface ToolVariable {
    name: string;
    type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'any';
    description: string;
    input_type: VariableInputType;
    required: boolean;
    default_value: unknown;
    children?: ToolVariable[];
}

const VALID_TYPES: ToolVariable['type'][] = ['string', 'integer', 'number', 'boolean', 'array', 'object', 'any'];
const VALID_INPUT_TYPES: VariableInputType[] = ['user_input', 'agent_input', 'mixed'];

export function variableToRowData(v: ToolVariable): Record<string, unknown> {
    return {
        name: v.name,
        type: v.type,
        description: v.description,
        default_value: v.default_value ?? '',
        required: v.required,
        children: Array.isArray(v.children) ? v.children : [],
    };
}

export function rowDataToVariable(data: Record<string, unknown>, inputType: VariableInputType): ToolVariable {
    const rawType = data['type'];
    const type: ToolVariable['type'] = VALID_TYPES.includes(rawType as ToolVariable['type'])
        ? (rawType as ToolVariable['type'])
        : 'string';

    const rawChildren = data['children'];
    const children = Array.isArray(rawChildren) ? (rawChildren as ToolVariable[]) : [];
    const normalizedChildren = type === 'object' ? children : undefined;

    return {
        name: String(data['name'] ?? ''),
        type,
        description: String(data['description'] ?? ''),
        input_type: inputType,
        required: Boolean(data['required']),
        default_value: data['default_value'] !== '' && data['default_value'] != null ? data['default_value'] : null,
        ...(normalizedChildren ? { children: normalizedChildren } : {}),
    };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidVariableType(value: unknown): value is ToolVariable['type'] {
    return typeof value === 'string' && VALID_TYPES.includes(value as ToolVariable['type']);
}

function isValidInputType(value: unknown): value is VariableInputType {
    return typeof value === 'string' && VALID_INPUT_TYPES.includes(value as VariableInputType);
}

function isToolVariable(value: unknown): value is ToolVariable {
    if (!isObjectRecord(value)) {
        return false;
    }

    if (
        typeof value['name'] !== 'string' ||
        typeof value['description'] !== 'string' ||
        typeof value['required'] !== 'boolean' ||
        !isValidVariableType(value['type']) ||
        !isValidInputType(value['input_type'])
    ) {
        return false;
    }

    if (value['children'] === undefined) {
        return true;
    }

    return isToolVariableArray(value['children']);
}

export function isToolVariableArray(value: unknown): value is ToolVariable[] {
    return Array.isArray(value) && value.every((item) => isToolVariable(item));
}

export function parseToolVariablesJson(json: string): { valid: boolean; variables: ToolVariable[] } {
    try {
        const parsed = JSON.parse(json);
        if (!isToolVariableArray(parsed)) {
            return { valid: false, variables: [] };
        }
        return { valid: true, variables: parsed };
    } catch {
        return { valid: false, variables: [] };
    }
}
