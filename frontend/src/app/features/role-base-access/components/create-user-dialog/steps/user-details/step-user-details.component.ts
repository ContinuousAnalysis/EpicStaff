import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    AvatarUploadComponent,
    CustomInputComponent,
    HelpTooltipComponent,
    PasswordStrengthComponent,
    ToggleSwitchComponent,
    ValidationErrorsComponent,
} from '@shared/components';
import { notNumericOnlyValidator } from '@shared/form-validators';
import { map } from 'rxjs';

@Component({
    selector: 'app-step-user-details',
    templateUrl: './step-user-details.component.html',
    styleUrls: ['./step-user-details.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        ValidationErrorsComponent,
        ToggleSwitchComponent,
        HelpTooltipComponent,
        AvatarUploadComponent,
        PasswordStrengthComponent,
    ],
})
export class StepUserDetailsComponent {
    private fb = inject(FormBuilder);

    form = this.fb.group({
        full_name: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: new FormControl('', {
            nonNullable: true,
            validators: [
                Validators.required,
                Validators.minLength(8),
                Validators.maxLength(40),
                notNumericOnlyValidator(),
            ],
        }),
        superadmin: [false],
        picture: [null as File | null],
    });

    readonly isFormValid = toSignal(this.form.statusChanges.pipe(map(() => this.form.valid)), {
        initialValue: this.form.valid,
    });

    get password(): string {
        return this.form.get('password')!.value;
    }
}
