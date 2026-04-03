import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TooltipComponent, ValidationErrorsComponent } from '@shared/components';
import { AppIconComponent, ButtonComponent, CustomInputComponent } from '@shared/components';
import { LLMProvider, RealtimeModel } from '@shared/models';
import { getProviderIconPath } from '@shared/utils';
import { finalize } from 'rxjs/operators';

import { ConfigService } from '../../../../services/config';
import { ToastService } from '../../../../services/notifications';

export interface CreateRealtimeModelDialogData {
    provider: LLMProvider;
}

@Component({
    selector: 'app-create-realtime-model-modal',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AppIconComponent,
        CustomInputComponent,
        ButtonComponent,
        TooltipComponent,
        ValidationErrorsComponent,
    ],
    templateUrl: './create-realtime-model-modal.component.html',
    styleUrls: ['./create-realtime-model-modal.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateRealtimeModelModalComponent {
    private dialogRef = inject(DialogRef);
    private dialogData = inject<CreateRealtimeModelDialogData>(DIALOG_DATA);
    private fb = inject(FormBuilder);
    private http = inject(HttpClient);
    private configService = inject(ConfigService);
    private toastService = inject(ToastService);

    private get apiUrl(): string {
        return this.configService.apiUrl + 'realtime-models/';
    }

    isSubmitting = signal(false);

    form = this.fb.group({
        name: ['', Validators.required],
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

        this.http
            .post<RealtimeModel>(
                this.apiUrl,
                {
                    name: (value.name || '').trim(),
                    provider: this.provider.id,
                },
                { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }
            )
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
