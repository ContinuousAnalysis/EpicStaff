import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, ValidationErrorsComponent } from '@shared/components';
import { catchError, EMPTY, tap } from 'rxjs';

import { OpenAIRealtimeConfig } from '../../../../shared/models/realtime-voice/openai-realtime-config.model';
import { OpenAIRealtimeConfigStorageService } from '../../services/llms/openai-realtime-config-storage.service';

@Component({
    selector: 'app-openai-realtime-config-dialog',
    templateUrl: './openai-realtime-config-dialog.component.html',
    styleUrls: ['./openai-realtime-config-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, ButtonComponent, ValidationErrorsComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenAIRealtimeConfigDialogComponent {
    private readonly fb = inject(FormBuilder);
    private readonly dialogRef = inject(DialogRef);
    private readonly storage = inject(OpenAIRealtimeConfigStorageService);
    private readonly destroyRef = inject(DestroyRef);
    readonly data = inject<{ config: OpenAIRealtimeConfig | null; action: 'create' | 'update' }>(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    form = this.fb.nonNullable.group({
        custom_name: [this.data.config?.custom_name ?? '', Validators.required],
        api_key: [this.data.config?.api_key ?? ''],
        model_name: [this.data.config?.model_name ?? 'gpt-4o-realtime-preview', Validators.required],
        transcription_model_name: [this.data.config?.transcription_model_name ?? 'whisper-1'],
        transcription_api_key: [this.data.config?.transcription_api_key ?? ''],
        voice_recognition_prompt: [this.data.config?.voice_recognition_prompt ?? ''],
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
