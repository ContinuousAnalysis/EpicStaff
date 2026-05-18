import {
    DestroyRef,
    Directive,
    effect,
    EventEmitter,
    inject,
    Injector,
    input,
    OnInit,
    signal,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControlStatus, FormGroup, ValidatorFn } from '@angular/forms';
import { ApiErrorItem } from '@shared/models';

/**
 * A lightweight mediator between a component and {@link ServerErrorsDirective}.
 *
 * The component creates and holds a `ServerErrorsRef`, passes it to the directive
 * via the `[errorsRef]` input, and calls `setErrors()` / `clear()` at any time —
 * even when the directive doesn't exist yet (e.g. hidden behind `@if`).
 *
 * When the directive (re-)initialises it picks up the latest value automatically.
 */
export class ServerErrorsRef {
    private readonly _errors = signal<ApiErrorItem[] | null>(null);
    readonly errors = this._errors.asReadonly();

    setErrors(items: ApiErrorItem[]): void {
        this._errors.set(items);
    }

    clear(): void {
        this._errors.set([]);
    }
}

/**
 * Binds a FormGroup to a server-error source. Server errors become validators,
 * so they participate in the same validation pipeline as built-in validators —
 * `form.valid` honestly reflects server state, no `setErrors` overwriting,
 * no manual change detection.
 *
 * Usage:
 *   <form [formGroup]="form" [appServerErrors]="form" #serverErrors="serverErrors">
 *   serverErrors.setErrors(err.validationErrors ?? []);
 *
 * Server messages clear automatically when the user edits the affected field.
 *
 * Non-field errors (field === '__all__' / 'non_field_errors' / '' / null) are
 * collected separately and exposed via `formLevelErrors()`.
 */
@Directive({
    selector: '[appServerErrors]',
    exportAs: 'serverErrors',
})
export class ServerErrorsDirective implements OnInit {
    /** The FormGroup to bind. Taken via input — the directive does not assume host context. */
    appServerErrors = input.required<FormGroup>();

    /** Optional: map backend field names → form control names (default: identity). */
    fieldMap = input<Record<string, string>>({});

    /** Optional: a {@link ServerErrorsRef} that buffers errors across `@if` boundaries. */
    errorsRef = input<ServerErrorsRef>();

    private readonly fieldErrors = signal<Record<string, string[]>>({});
    private readonly formErrors = signal<string[]>([]);

    /** Read-only public API for templates. */
    readonly formLevelErrors = this.formErrors.asReadonly();

    private readonly destroyRef = inject(DestroyRef);
    private readonly injector = inject(Injector);

    private isInitialized = false;

    ngOnInit(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        const group = this.appServerErrors();

        // 1. Attach a per-field validator that pulls from this directive's signal.
        for (const [field, ctrl] of Object.entries(group.controls)) {
            ctrl.addValidators(this.makeValidator(field));
        }

        // 2. When the signal changes, re-run validation so control.errors picks up server messages.
        effect(
            () => {
                this.fieldErrors();
                for (const ctrl of Object.values(group.controls)) {
                    ctrl.updateValueAndValidity({ emitEvent: false });
                    // Manually fire statusChanges so subscribers (ValidationErrorsComponent)
                    // know to re-evaluate. We avoid emitEvent:true because that also fires
                    // valueChanges, which our own auto-clear subscription listens to.
                    (ctrl.statusChanges as EventEmitter<FormControlStatus>).emit(ctrl.status);
                }
            },
            { injector: this.injector }
        );

        // 3. Auto-clear a field's server errors as soon as the user edits it.
        for (const [field, ctrl] of Object.entries(group.controls)) {
            ctrl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                if (this.fieldErrors()[field]) {
                    this.fieldErrors.update((m) => {
                        const next = { ...m };
                        delete next[field];
                        return next;
                    });
                }
            });
        }

        // 4. If an errorsRef is provided, sync with it.
        const ref = this.errorsRef();
        if (ref) {
            effect(
                () => {
                    const errors = ref.errors();
                    if (errors === null) return;
                    untracked(() => {
                        if (errors.length) {
                            this.setErrors(errors);
                        } else {
                            this.clear();
                        }
                    });
                },
                { injector: this.injector }
            );
        }
    }

    /** Apply a batch of server errors. Form is marked touched so messages render. */
    setErrors(errors: ApiErrorItem[]): void {
        const grouped: Record<string, string[]> = {};
        const formLevel: string[] = [];
        const map = this.fieldMap();

        for (const { field, reason } of errors) {
            const key = field ? (map[field] ?? field) : '';
            if (!key || key === '__all__' || key === 'non_field_errors') {
                formLevel.push(reason);
            } else {
                (grouped[key] ??= []).push(reason);
            }
        }

        this.fieldErrors.set(grouped);
        this.formErrors.set(formLevel);
        this.appServerErrors().markAllAsTouched();
    }

    /** Clear all server errors (call before submit). */
    clear(): void {
        this.fieldErrors.set({});
        this.formErrors.set([]);
    }

    private makeValidator(field: string): ValidatorFn {
        return () => {
            const msgs = this.fieldErrors()[field];
            return msgs?.length ? { server: msgs } : null;
        };
    }
}
