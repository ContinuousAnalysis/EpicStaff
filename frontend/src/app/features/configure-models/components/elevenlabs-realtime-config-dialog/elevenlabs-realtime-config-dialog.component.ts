import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, ValidationErrorsComponent } from '@shared/components';
import { catchError, EMPTY, tap } from 'rxjs';

import { ElevenLabsRealtimeConfig } from '../../../../shared/models/realtime-voice/elevenlabs-realtime-config.model';
import { ElevenLabsRealtimeConfigStorageService } from '../../services/llms/elevenlabs-realtime-config-storage.service';

@Component({
    selector: 'app-elevenlabs-realtime-config-dialog',
    templateUrl: './elevenlabs-realtime-config-dialog.component.html',
    styleUrls: ['./elevenlabs-realtime-config-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, ButtonComponent, ValidationErrorsComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElevenLabsRealtimeConfigDialogComponent {
    private readonly fb = inject(FormBuilder);
    private readonly dialogRef = inject(DialogRef);
    private readonly storage = inject(ElevenLabsRealtimeConfigStorageService);
    private readonly destroyRef = inject(DestroyRef);
    readonly data = inject<{ config: ElevenLabsRealtimeConfig | null; action: 'create' | 'update' }>(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    form = this.fb.nonNullable.group({
        custom_name: [this.data.config?.custom_name ?? '', Validators.required],
        api_key: [this.data.config?.api_key ?? ''],
        model_name: [this.data.config?.model_name ?? 'eleven_turbo_v2_5', Validators.required],
        language: [this.data.config?.language ?? ''],
    });

    private readonly _keyboard$ = this.dialogRef.keydownEvents
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                e.preventDefault();
                this.onSubmit();
            }
        });

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        this.isSubmitting.set(true);
        const v = this.form.getRawValue();
        const obs =
            this.data.action === 'create'
                ? this.storage.createConfig(v)
                : this.storage.updateConfig({ ...v, id: this.data.config!.id });
        obs.pipe(
            tap(() => this.dialogRef.close(true)),
            catchError(() => {
                this.errorMessage.set('Failed to save configuration.');
                this.isSubmitting.set(false);
                return EMPTY;
            }),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    onCancel(): void {
        this.dialogRef.close(null);
    }
}
