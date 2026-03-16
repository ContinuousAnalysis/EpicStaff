import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
    AppIconComponent,
    ButtonComponent,
    CustomInputComponent,
    PasswordStrengthComponent,
    ValidationErrorsComponent
} from "@shared/components";
import { SetupService } from '../../../../services/auth/setup.service';
import { AuthService } from '../../../../services/auth/auth.service';
import { CheckboxComponent } from "../../../../shared/components/checkbox/checkbox.component";

@Component({
    selector: 'app-sign-up',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AppIconComponent,
        ButtonComponent,
        CustomInputComponent,
        PasswordStrengthComponent,
        ValidationErrorsComponent,
        CheckboxComponent,
    ],
    templateUrl: './sign-up-page.component.html',
    styleUrls: ['../login-page/login-page.component.scss', './sign-up-page.component.scss'],
})
export class SignUpPageComponent {
    private readonly setupService = inject(SetupService);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    form = new FormGroup({
        username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(8)]
        }),
        email: new FormControl('', { nonNullable: true }),
    });

    apiKey: string | null = null;
    loading = false;
    termsAccepted = false;

    get password(): string {
        return this.form.get('password')!.value;
    }

    onSubmit(): void {
        this.form.markAllAsTouched();
        if (this.form.invalid) return;

        this.loading = true;

        const payload = this.form.getRawValue();
        this.setupService.runSetup(payload).subscribe({
            next: (resp) => {
                this.apiKey = resp.api_key;
                this.form.disable();
                localStorage.setItem('auth.access', resp.access);
                localStorage.setItem('auth.refresh', resp.refresh);
                this.loading = false;
            },
            error: () => {
                this.loading = false;
            },
            complete: () => {
                this.loading = false;
            },
        });
    }

    navToLogin(): void {
        this.router.navigate(['/login']);
    }
}
