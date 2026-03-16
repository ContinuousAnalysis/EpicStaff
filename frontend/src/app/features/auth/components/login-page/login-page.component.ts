import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
    AppIconComponent,
    ButtonComponent,
    CustomInputComponent,
    ValidationErrorsComponent
} from "@shared/components";
import { AuthService } from '../../../../services/auth/auth.service';
import { CheckboxComponent } from "../../../../shared/components/checkbox/checkbox.component";

@Component({
    selector: 'app-login-page',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, CustomInputComponent, ValidationErrorsComponent, ButtonComponent, AppIconComponent, CheckboxComponent],
    templateUrl: './login-page.component.html',
    styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent {
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    form = new FormGroup({
        username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    });

    loading = false;

    onSubmit(): void {
        if (this.form.invalid) return;

        this.loading = true;

        const { username, password } = this.form.getRawValue();
        this.authService.login(username, password).subscribe({
            next: () => {
                const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/projects';
                this.router.navigateByUrl(returnUrl);
            },
            error: () => {
                this.loading = false;
            },
            complete: () => {
                this.loading = false;
            },
        });
    }

    navToSignUp(): void {
        this.router.navigateByUrl('sign-up');
    }
}
