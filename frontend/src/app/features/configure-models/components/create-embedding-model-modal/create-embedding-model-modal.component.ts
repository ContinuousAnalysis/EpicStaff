import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    AppIconComponent,
    ButtonComponent,
    CustomInputComponent,
    ToggleSwitchComponent,
    TooltipComponent,
    ValidationErrorsComponent,
} from '@shared/components';
import { LLMProvider } from '@shared/models';
import { EmbeddingModelsService } from '@shared/services';
import { getProviderIconPath } from '@shared/utils';
import { finalize } from 'rxjs/operators';

import { ToastService } from '../../../../services/notifications';

export interface CreateEmbeddingModelDialogData {
    provider: LLMProvider;
}

@Component({
    selector: 'app-create-embedding-model-modal',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AppIconComponent,
        CustomInputComponent,
        ButtonComponent,
        ToggleSwitchComponent,
        TooltipComponent,
        ValidationErrorsComponent,
    ],
    templateUrl: './create-embedding-model-modal.component.html',
    styleUrls: ['./create-embedding-model-modal.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEmbeddingModelModalComponent {
    private dialogRef = inject(DialogRef);
    private dialogData = inject<CreateEmbeddingModelDialogData>(DIALOG_DATA);
    private fb = inject(FormBuilder);
    private embeddingModelsService = inject(EmbeddingModelsService);
    private toastService = inject(ToastService);

    isSubmitting = signal(false);

    form = this.fb.group({
        name: ['', Validators.required],
        baseUrl: ['', Validators.pattern(/^$|^https?:\/\/.+/i)],
        deployment: [''],
        isVisible: [true],
    });

    provider = this.dialogData.provider;
    getProviderIcon = getProviderIconPath;

    onClose(): void {
        this.dialogRef.close(null);
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const value = this.form.getRawValue();
        this.isSubmitting.set(true);

        this.embeddingModelsService
            .createModel({
                name: (value.name || '').trim(),
                base_url: value.baseUrl?.trim() || null,
                deployment: value.deployment?.trim() || null,
                embedding_provider: this.provider.id,
                is_visible: !!value.isVisible,
                is_custom: true,
                predefined: false,
            })
            .pipe(finalize(() => this.isSubmitting.set(false)))
            .subscribe({
                next: (created) => {
                    this.dialogRef.close(created);
                },
                error: (error) => {
                    this.toastService.error(this.extractApiErrorMessage(error));
                },
            });
    }

    private extractApiErrorMessage(error: unknown): string {
        const fallback = 'Failed to create model.';
        const httpError = error as { error?: unknown; message?: string };
        const payload = httpError?.error;

        if (typeof payload === 'string' && payload.trim()) {
            return payload;
        }

        if (payload && typeof payload === 'object') {
            const entries = Object.entries(payload as Record<string, unknown>);
            if (entries.length > 0) {
                const [field, value] = entries[0];
                const normalized = Array.isArray(value) ? value[0] : value;
                if (typeof normalized === 'string' && normalized.trim()) {
                    return `${field}: ${normalized}`;
                }
            }
        }

        if (httpError?.message) {
            return httpError.message;
        }

        return fallback;
    }
}
