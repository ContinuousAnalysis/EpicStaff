import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import {
    AppSvgIconComponent,
    ButtonComponent,
    CustomInputComponent,
    PasswordStrengthComponent,
    ValidationErrorsComponent,
} from '@shared/components';
import { notNumericOnlyValidator } from '@shared/form-validators';
import { ApiErrorItem } from '@shared/models';

import { AuthService } from '../../../../services/auth/auth.service';
import { ToastService } from '../../../../services/notifications';

type PageState = 'invalid-token' | 'set-password' | 'success';

@Component({
    selector: 'app-reset-password-page',
    templateUrl: './reset-password-page.component.html',
    styleUrls: ['./reset-password-page.component.scss'],
    imports: [
        ReactiveFormsModule,
        AppSvgIconComponent,
        ButtonComponent,
        CustomInputComponent,
        ValidationErrorsComponent,
        MatIconModule,
        PasswordStrengthComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPageComponent {
    private route = inject(ActivatedRoute);
    private authService = inject(AuthService);
    private destroyRef = inject(DestroyRef);
    private toast = inject(ToastService);
    private router = inject(Router);

    private token = '';

    state = signal<PageState>('set-password');
    loading = signal(false);
    passwordError = signal<string | null>(null);

    readonly passwordControl = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(40), notNumericOnlyValidator()],
    });

    constructor() {
        this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

        if (!this.token) this.navToLogin();
    }

    get password(): string {
        return this.passwordControl.getRawValue();
    }

    onSetPassword(): void {
        this.passwordError.set(null);
        this.passwordControl.markAsTouched();
        if (this.passwordControl.invalid) return;

        const data = {
            token: this.token,
            new_password: this.password.toString(),
        };

        this.loading.set(true);
        this.authService
            .confirmResetPassword(data)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.loading.set(false);
                    this.state.set('success');
                },
                error: (err) => {
                    this.loading.set(false);
                    const errors: ApiErrorItem[] = err?.error?.errors ?? [];

                    if (errors.length) {
                        this.handleErrorResponse(errors);
                    } else {
                        this.toast.error(err?.error.message);
                    }
                },
            });
    }

    navToLogin(): void {
        void this.router.navigateByUrl('/login');
    }

    private handleErrorResponse(errors: ApiErrorItem[]) {
        const tokenError = errors.find((e) => e.field === 'token');
        const passwordError = errors.find((e) => e.field === 'new_password');

        if (tokenError) {
            this.toast.error(`Token error: ${tokenError.reason}`);
        }

        if (passwordError) {
            this.passwordError.set(passwordError.reason);
        }
    }
}
