import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, ValidationErrorsComponent } from '@shared/components';

import { GeminiRealtimeConfig } from '../../../../shared/models/realtime-voice/gemini-realtime-config.model';
import { GeminiRealtimeConfigStorageService } from '../../services/llms/gemini-realtime-config-storage.service';

@Component({
    selector: 'app-gemini-realtime-config-dialog',
    templateUrl: './gemini-realtime-config-dialog.component.html',
    styleUrls: ['./gemini-realtime-config-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, ButtonComponent, ValidationErrorsComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeminiRealtimeConfigDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private dialogRef = inject(DialogRef);
    private storage = inject(GeminiRealtimeConfigStorageService);
    private destroyRef = inject(DestroyRef);
    data: { config: GeminiRealtimeConfig | null; action: 'create' | 'update' } = inject(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    form!: FormGroup;

    ngOnInit(): void {
        const c = this.data.config;
        this.form = this.fb.group({
            custom_name: [c?.custom_name ?? '', Validators.required],
            api_key: [c?.api_key ?? ''],
            model_name: [c?.model_name ?? 'gemini-2.0-flash-live-001', Validators.required],
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
