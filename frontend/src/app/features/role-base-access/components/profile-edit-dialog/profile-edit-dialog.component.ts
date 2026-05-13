import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    AppSvgIconComponent,
    AvatarUploadComponent,
    ButtonComponent,
    CustomInputComponent,
    HelpTooltipComponent,
    ValidationErrorsComponent,
} from '@shared/components';
import { timer } from 'rxjs';

export interface ProfileEditDialogData {
    name: string;
    email: string;
}

export interface ProfileEditDialogResult {
    name: string;
    email: string;
    picture: File | null;
}

@Component({
    selector: 'app-profile-edit-dialog',
    templateUrl: './profile-edit-dialog.component.html',
    styleUrls: ['./profile-edit-dialog.component.scss'],
    imports: [
        ReactiveFormsModule,
        AppSvgIconComponent,
        ButtonComponent,
        CustomInputComponent,
        ValidationErrorsComponent,
        HelpTooltipComponent,
        AvatarUploadComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditDialogComponent {
    private readonly dialogRef = inject(DialogRef<ProfileEditDialogResult | null>);
    private readonly destroyRef = inject(DestroyRef);
    private readonly fb = inject(FormBuilder);
    private readonly data = inject<ProfileEditDialogData>(DIALOG_DATA);

    readonly loading = signal(false);

    readonly form = this.fb.group({
        full_name: ['this.data.name', [Validators.required]],
        email: ['this.data.email', [Validators.required, Validators.email]],
        picture: [null as File | null],
    });

    onSave(): void {
        this.form.markAllAsTouched();
        if (this.form.invalid) return;

        this.loading.set(true);
        const { full_name, email, picture } = this.form.getRawValue();
        // TODO: replace with userService.updateProfile(...)
        timer(600)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.loading.set(false);
                this.dialogRef.close({ name: full_name!, email: email!, picture });
            });
    }

    onCancel(): void {
        this.dialogRef.close(null);
    }
}
