import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent, CustomInputComponent, ValidationErrorsComponent } from '@shared/components';

import { ElevenLabsRealtimeConfig } from '../../../../shared/models/realtime-voice/elevenlabs-realtime-config.model';
import { ElevenLabsRealtimeConfigStorageService } from '../../services/llms/elevenlabs-realtime-config-storage.service';

@Component({
    selector: 'app-elevenlabs-realtime-config-dialog',
    templateUrl: './elevenlabs-realtime-config-dialog.component.html',
    styleUrls: ['./elevenlabs-realtime-config-dialog.component.scss'],
    imports: [ReactiveFormsModule, CustomInputComponent, ButtonComponent, ValidationErrorsComponent, NgIf],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElevenLabsRealtimeConfigDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private dialogRef = inject(DialogRef);
    private storage = inject(ElevenLabsRealtimeConfigStorageService);
    private destroyRef = inject(DestroyRef);
    data: { config: ElevenLabsRealtimeConfig | null; action: 'create' | 'update' } = inject(DIALOG_DATA);

    isSubmitting = signal(false);
    errorMessage = signal<string | null>(null);

    form!: FormGroup;

    ngOnInit(): void {
        const c = this.data.config;
        this.form = this.fb.group({
            custom_name: [c?.custom_name ?? '', Validators.required],
            api_key: [c?.api_key ?? ''],
            model_name: [c?.model_name ?? 'eleven_turbo_v2_5', Validators.required],
            language: [c?.language ?? ''],
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
