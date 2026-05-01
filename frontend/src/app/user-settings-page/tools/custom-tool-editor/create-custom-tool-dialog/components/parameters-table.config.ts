import { ValidatorFn, Validators } from '@angular/forms';

import { TableColumnDef, TableRow } from '../../../../../shared/components/dynamic-table/dynamic-table.models';

export type VariableInputType = 'user_input' | 'agent_input' | 'mixed';

export interface VariableSectionConfig {
    inputType: VariableInputType;
    label: string;
    icon: string;
    columnDefs: TableColumnDef[];
}

const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 8046;
const PYTHON_IDENTIFIER_PATTERN = /^[a-zA-Z]\w*$/;

const NAME_VALIDATORS = [
    Validators.required,
    Validators.maxLength(NAME_MAX_LENGTH),
    Validators.pattern(PYTHON_IDENTIFIER_PATTERN),
];
const NAME_ERROR_MESSAGES = {
    required: 'Name is required.',
    maxlength: `Name must be ${NAME_MAX_LENGTH} characters or fewer.`,
    pattern: 'Name must start with a letter and contain only letters, digits, or underscores.',
};

const DESCRIPTION_VALIDATORS = [Validators.maxLength(DESCRIPTION_MAX_LENGTH)];
const DESCRIPTION_ERROR_MESSAGES = {
    maxlength: `Description must be ${DESCRIPTION_MAX_LENGTH} characters or fewer.`,
};

const TYPE_OPTIONS = [
    { label: 'string', value: 'string' },
    { label: 'number', value: 'number' },
    { label: 'boolean', value: 'boolean' },
    { label: 'object', value: 'object' },
];

const numberValueValidator: ValidatorFn = (control) => {
    const v = control.value;
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? null : { invalidNumber: true };
    const s = String(v).trim();
    if (s === '') return null;
    return /^-?(\d+(\.\d+)?|\.\d+)$/.test(s) ? null : { invalidNumber: true };
};

const booleanValueValidator: ValidatorFn = (control) => {
    const v = control.value;
    if (v === '' || v == null) return null;
    if (typeof v === 'boolean') return null;
    const s = String(v).trim().toLowerCase();
    if (s === '') return null;
    return s === 'true' || s === 'false' ? null : { invalidBoolean: true };
};

const DEFAULT_VALUE_ERROR_MESSAGES = {
    invalidNumber: 'Default value must be a valid number.',
    invalidBoolean: 'Default value must be "true" or "false".',
};

export const getCellExtraValidators = (row: TableRow, colKey: string): ValidatorFn[] => {
    if (colKey !== 'default_value') return [];
    const type = row.data['type'];
    switch (type) {
        case 'number':
            return [numberValueValidator];
        case 'boolean':
            return [booleanValueValidator];
        default:
            return [];
    }
};

const NAME_COLUMN: TableColumnDef = {
    key: 'name',
    header: 'Name',
    type: 'input',
    width: '140px',
    placeholder: 'variable_name',
    required: true,
    unique: true,
    uniqueErrorMessage: 'Variable names must be unique.',
    validators: NAME_VALIDATORS,
    errorMessages: NAME_ERROR_MESSAGES,
};

const TYPE_COLUMN: TableColumnDef = {
    key: 'type',
    header: 'Type',
    type: 'select',
    width: '120px',
    options: TYPE_OPTIONS,
    defaultValue: 'string',
};

const DESCRIPTION_COLUMN: TableColumnDef = {
    key: 'description',
    header: 'Description',
    type: 'input',
    width: '380px',
    placeholder: 'What this variable is for',
    validators: DESCRIPTION_VALIDATORS,
    errorMessages: DESCRIPTION_ERROR_MESSAGES,
};

export const USER_INPUT_COLUMN_DEFS = [
    NAME_COLUMN,
    TYPE_COLUMN,
    {
        key: 'default_value',
        header: 'Value',
        type: 'input',
        width: '260px',
        placeholder: '',
        errorMessages: DEFAULT_VALUE_ERROR_MESSAGES,
    },
    DESCRIPTION_COLUMN,
] satisfies TableColumnDef[];

export const AGENT_INPUT_COLUMN_DEFS = [
    NAME_COLUMN,
    TYPE_COLUMN,
    {
        key: 'default_value',
        header: 'Default Value',
        type: 'input',
        width: '260px',
        placeholder: '',
        errorMessages: DEFAULT_VALUE_ERROR_MESSAGES,
    },
    DESCRIPTION_COLUMN,
    { key: 'required', header: 'Required', type: 'checkbox', width: '80px' },
] satisfies TableColumnDef[];

export const MIXED_COLUMN_DEFS = [
    NAME_COLUMN,
    TYPE_COLUMN,
    {
        key: 'default_value',
        header: 'Default Value',
        type: 'input',
        width: '260px',
        placeholder: '',
        errorMessages: DEFAULT_VALUE_ERROR_MESSAGES,
    },
    DESCRIPTION_COLUMN,
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
    type: 'string' | 'number' | 'boolean' | 'object';
    description: string;
    input_type: VariableInputType;
    required: boolean;
    default_value: unknown;
    children?: ToolVariable[];
}

const VALID_TYPES: ToolVariable['type'][] = ['string', 'number', 'boolean', 'object'];
const VALID_INPUT_TYPES: VariableInputType[] = ['user_input', 'agent_input', 'mixed'];

export function variableToRowData(v: ToolVariable): Record<string, unknown> {
    return {
        name: v.name,
        type: v.type,
        description: v.description,
        default_value: v.default_value === null || v.default_value === undefined ? '' : String(v.default_value),
        required: v.required,
        children: Array.isArray(v.children) ? v.children : [],
    };
}

function parseDefaultValue(raw: unknown, type: ToolVariable['type']): unknown {
    if (raw === '' || raw == null) return null;

    if (type === 'number') {
        const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
        return Number.isFinite(n) ? n : null;
    }
    if (type === 'boolean') {
        if (typeof raw === 'boolean') return raw;
        const s = String(raw).trim().toLowerCase();
        if (s === 'true') return true;
        if (s === 'false') return false;
        return null;
    }
    if (type === 'object') return null;
    return String(raw);
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
        default_value: parseDefaultValue(data['default_value'], type),
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

// --- Backend payload schema (per EST-1529 spec) ---

interface PropertySchema {
    type: ToolVariable['type'];
    description?: string;
    default_value?: unknown;
    properties?: Record<string, PropertySchema>;
    required_properties?: string[];
}

export interface BackendToolVariable {
    name: string;
    type: ToolVariable['type'];
    description: string;
    input_type: VariableInputType;
    required: boolean;
    default_value: unknown;
    properties?: Record<string, PropertySchema>;
    required_properties?: string[];
}

function childrenToProperties(children: ToolVariable[]): {
    properties: Record<string, PropertySchema>;
    required_properties: string[];
} {
    const properties: Record<string, PropertySchema> = {};
    const required_properties: string[] = [];

    for (const child of children) {
        const name = child.name?.trim();
        if (!name) continue;

        const schema: PropertySchema = { type: child.type };
        if (child.description) {
            schema.description = child.description;
        }
        if (child.default_value !== null && child.default_value !== undefined) {
            schema.default_value = child.default_value;
        }
        if (child.type === 'object') {
            const nested = childrenToProperties(child.children ?? []);
            schema.properties = nested.properties;
            schema.required_properties = nested.required_properties;
        }

        properties[name] = schema;
        if (child.required) {
            required_properties.push(name);
        }
    }

    return { properties, required_properties };
}

export function serializeVariables(vars: ToolVariable[]): BackendToolVariable[] {
    return vars.map((v) => {
        const out: BackendToolVariable = {
            name: v.name,
            type: v.type,
            description: v.description,
            input_type: v.input_type,
            required: v.required,
            default_value: v.default_value,
        };

        if (v.type === 'object') {
            const nested = childrenToProperties(v.children ?? []);
            out.properties = nested.properties;
            out.required_properties = nested.required_properties;
        }

        return out;
    });
}

function propertiesToChildren(
    properties: unknown,
    requiredProperties: unknown,
    inputType: VariableInputType
): ToolVariable[] {
    if (!isObjectRecord(properties)) return [];
    const requiredSet = new Set(
        Array.isArray(requiredProperties) ? requiredProperties.filter((n) => typeof n === 'string') : []
    );

    const result: ToolVariable[] = [];
    for (const [name, raw] of Object.entries(properties)) {
        if (!isObjectRecord(raw)) continue;
        const type = isValidVariableType(raw['type']) ? raw['type'] : 'string';

        const variable: ToolVariable = {
            name,
            type,
            description: typeof raw['description'] === 'string' ? raw['description'] : '',
            input_type: inputType,
            required: requiredSet.has(name),
            default_value: raw['default_value'] ?? null,
        };

        if (type === 'object') {
            variable.children = propertiesToChildren(raw['properties'], raw['required_properties'], inputType);
        }

        result.push(variable);
    }

    return result;
}

function isBackendVariable(value: unknown): value is BackendToolVariable {
    if (!isObjectRecord(value)) return false;
    if (
        typeof value['name'] !== 'string' ||
        typeof value['description'] !== 'string' ||
        typeof value['required'] !== 'boolean' ||
        !isValidVariableType(value['type']) ||
        !isValidInputType(value['input_type'])
    ) {
        return false;
    }
    if (value['type'] === 'object') {
        if (value['properties'] !== undefined && !isObjectRecord(value['properties'])) return false;
        if (value['required_properties'] !== undefined && !Array.isArray(value['required_properties'])) return false;
    }
    return true;
}

export function deserializeVariables(data: unknown): ToolVariable[] {
    if (!Array.isArray(data)) return [];

    const result: ToolVariable[] = [];
    for (const item of data) {
        if (!isBackendVariable(item)) continue;

        const variable: ToolVariable = {
            name: item.name,
            type: item.type,
            description: item.description,
            input_type: item.input_type,
            required: item.required,
            default_value: item.default_value ?? null,
        };

        if (item.type === 'object') {
            variable.children = propertiesToChildren(item.properties, item.required_properties, item.input_type);
        }

        result.push(variable);
    }

    return result;
}

function isVariableShallowValid(v: ToolVariable): boolean {
    const name = v.name?.trim();
    if (!name) return false;
    if (name.length > NAME_MAX_LENGTH) return false;
    if (!PYTHON_IDENTIFIER_PATTERN.test(name)) return false;

    if (typeof v.description === 'string' && v.description.length > DESCRIPTION_MAX_LENGTH) {
        return false;
    }
    return true;
}

// Walks the variable tree and validates each variable individually plus
// uniqueness of names within the same level (siblings). Used as the canonical
// pre-save check, since FormControls only exist for currently-visible cells.
export function validateVariablesTree(vars: ToolVariable[]): boolean {
    const names: string[] = [];
    for (const v of vars) {
        if (!isVariableShallowValid(v)) return false;
        names.push(v.name.trim());
        if (v.type === 'object' && Array.isArray(v.children) && !validateVariablesTree(v.children)) {
            return false;
        }
    }
    if (new Set(names).size !== names.length) return false;
    return true;
}

export function parseToolVariablesJson(json: string): { valid: boolean; variables: ToolVariable[] } {
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed) || !parsed.every(isBackendVariable)) {
            return { valid: false, variables: [] };
        }
        return { valid: true, variables: deserializeVariables(parsed) };
    } catch {
        return { valid: false, variables: [] };
    }
}
