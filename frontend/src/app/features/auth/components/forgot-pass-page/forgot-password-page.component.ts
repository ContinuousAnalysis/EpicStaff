import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
    AppSvgIconComponent,
    ButtonComponent,
    CustomInputComponent,
    ValidationErrorsComponent,
} from '@shared/components';

import { AuthService } from '../../../../services/auth/auth.service';

type PageState = 'request' | 'email-sent';

@Component({
    selector: 'app-forgot-password',
    templateUrl: './forgot-password-page.component.html',
    styleUrls: ['../login-page/login-page.component.scss', './forgot-password-page.component.scss'],
    imports: [
        ReactiveFormsModule,
        AppSvgIconComponent,
        ButtonComponent,
        CustomInputComponent,
        ValidationErrorsComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPageComponent {
    private authService = inject(AuthService);
    private router = inject(Router);
    private destroyRef = inject(DestroyRef);

    state = signal<PageState>('request');
    submittedEmail = signal('');
    loading = signal(false);

    readonly emailControl = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
    });

    onRequestReset(): void {
        this.emailControl.markAsTouched();
        if (this.emailControl.invalid) return;
        const email = this.emailControl.getRawValue().toString();

        this.loading.set(true);
        this.authService
            .requestResetPassword({ email })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.submittedEmail.set(this.emailControl.getRawValue());
                this.loading.set(false);
                this.state.set('email-sent');
            });
    }

    navToLogin(): void {
        void this.router.navigate(['/login']);
    }
}
