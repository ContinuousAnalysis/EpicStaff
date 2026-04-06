import { ValidatorFn } from '@angular/forms';

export interface TableSelectOption {
    label: string;
    value: unknown;
}

export interface TableColumnDef {
    key: string; // field key in row data
    header: string; // column header label
    type: 'input' | 'select' | 'checkbox';
    width?: string; // optional CSS width (e.g. '160px')
    placeholder?: string; // for input/select cells
    options?: TableSelectOption[]; // only for type='select'
    validators?: ValidatorFn[];
    errorMessages?: Record<string, string>; // key -> human message override
}

export interface TableRow {
    _id: string;
    data: Record<string, unknown>;
}
