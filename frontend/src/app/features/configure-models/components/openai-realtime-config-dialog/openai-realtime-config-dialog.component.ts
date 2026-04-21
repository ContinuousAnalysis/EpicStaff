import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, ValidationErrorsComponent } from '@shared/components';

import { OpenAIRealtimeConfig } from '../../../../shared/models/realtime-voice/openai-realtime-config.model';
import { OpenAIRealtimeConfigStorageService } from '../../services/llms/openai-realtime-config-storage.service';

@Component({
    selector: 'app-openai-realtime-config-dialog',
    templateUrl: './openai-realtime-config-dialog.component.html',
    styleUrls: ['./openai-realtime-config-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, ButtonComponent, ValidationErrorsComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenAIRealtimeConfigDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private dialogRef = inject(DialogRef);
    private storage = inject(OpenAIRealtimeConfigStorageService);
    private destroyRef = inject(DestroyRef);
    data: { config: OpenAIRealtimeConfig | null; action: 'create' | 'update' } = inject(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    form!: FormGroup;

    ngOnInit(): void {
        const c = this.data.config;
        this.form = this.fb.group({
            custom_name: [c?.custom_name ?? '', Validators.required],
            api_key: [c?.api_key ?? ''],
            model_name: [c?.model_name ?? 'gpt-4o-realtime-preview', Validators.required],
            transcription_model_name: [c?.transcription_model_name ?? 'whisper-1'],
            transcription_api_key: [c?.transcription_api_key ?? ''],
            voice_recognition_prompt: [c?.voice_recognition_prompt ?? ''],
        });
        this.dialogRef.keydownEvents.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
                e.preventDefault();
                this.onSubmit();
            }
        });
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }
        this.isSubmitting.set(true);
        const v = this.form.value;
        const obs =
            this.data.action === 'create'
                ? this.storage.createConfig(v)
                : this.storage.updateConfig({ ...v, id: this.data.config!.id });
        obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: () => this.dialogRef.close(true),
            error: () => {
                this.errorMessage.set('Failed to save configuration.');
                this.isSubmitting.set(false);
            },
        });
    }

    onCancel(): void {
        this.dialogRef.close(null);
    }
}
