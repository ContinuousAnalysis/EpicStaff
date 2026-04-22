import { FormGroup } from '@angular/forms';

interface ApiErrorItem {
    field: string;
    value: string | number;
    reason: string;
}

interface ApiErrorResponse {
    errors: ApiErrorItem[];
}

/**
 * Applies backend field-level errors to matching form controls.
 * Expects: { errors: [{ field, value, reason }] }
 */
export function applyApiErrors(form: FormGroup, errorResponse: unknown): void {
    if (!errorResponse || typeof errorResponse !== 'object') return;

    const { errors } = errorResponse as ApiErrorResponse;
    if (!Array.isArray(errors)) return;

    for (const { field, reason } of errors) {
        const control = form.get(field);
        if (control) {
            control.setErrors({ serverError: reason });
            control.markAsTouched();
        }
    }
}
