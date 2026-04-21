import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
    AppSvgIconComponent,
    ButtonComponent,
    CheckboxComponent,
    CustomInputComponent,
    PasswordStrengthComponent,
    ValidationErrorsComponent,
} from '@shared/components';
import { notNumericOnlyValidator, strictEmailValidator } from '@shared/form-validators';
import { forkJoin, timer } from 'rxjs';

import { AuthService } from '../../../../services/auth/auth.service';

type PageState = 'form' | 'loading' | 'success';

@Component({
    selector: 'app-sign-up',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        ButtonComponent,
        CustomInputComponent,
        PasswordStrengthComponent,
        ValidationErrorsComponent,
        CheckboxComponent,
        AppSvgIconComponent,
    ],
    templateUrl: './sign-up-page.component.html',
    styleUrls: ['../login-page/login-page.component.scss', './sign-up-page.component.scss'],
})
export class SignUpPageComponent {
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    termsControl = new FormControl(false);

    form = new FormGroup({
        email: new FormControl('', { nonNullable: true, validators: [Validators.required, strictEmailValidator()] }),
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(8), notNumericOnlyValidator()],
        }),
    });

    apiKey: string | null = null;
    state = signal<PageState>('form');
    serverError = signal<string | null>(null);

    get password(): string {
        return this.form.get('password')!.value;
    }

    onSubmit(): void {
        this.form.markAllAsTouched();
        if (this.form.invalid) return;

        this.serverError.set(null);
        this.state.set('loading');

        const payload = this.form.getRawValue();
        forkJoin([this.authService.runSetup(payload), timer(1000)]).subscribe({
            next: ([resp]) => {
                this.authService.storeTokens({ access: resp.access, refresh: resp.refresh });
                this.state.set('success');
                timer(1000).subscribe(() => {
                    void this.router.navigate(['/onboarding']);
                });
            },
            error: (err) => {
                this.state.set('form');
                this.serverError.set(
                    err?.error?.detail || err?.error?.message || 'Registration failed. Please try again.'
                );
            },
        });
    }

    navToLogin(): void {
        this.router.navigate(['/login']);
    }
}
