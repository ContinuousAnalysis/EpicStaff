import {
    Component,
    ChangeDetectionStrategy,
    Inject,
    OnInit,
    inject,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import {
    FormControl,
    FormGroup,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { GraphDto } from '../../models/graph.model';
import { MatrixBotDto } from '../../models/matrix-bot.model';
import { MatrixBotStorageService } from '../../services/matrix-bot-storage.service';
import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';

export interface MatrixBotDialogData {
    flow: GraphDto;
    bot: MatrixBotDto | null;
}

@Component({
    selector: 'app-matrix-bot-dialog',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, ReactiveFormsModule, ButtonComponent],
    templateUrl: './matrix-bot-dialog.component.html',
    styleUrls: ['./matrix-bot-dialog.component.scss'],
})
export class MatrixBotDialogComponent implements OnInit {
    private readonly storageService = inject(MatrixBotStorageService);

    public readonly isSubmitting = signal(false);
    public readonly errorMessage = signal<string | null>(null);
    public readonly isDeleting = signal(false);

    public form: FormGroup;
    public existingBot: MatrixBotDto | null;
    public flow: GraphDto;

    constructor(
        public dialogRef: DialogRef<void>,
        @Inject(DIALOG_DATA) public data: MatrixBotDialogData
    ) {
        this.flow = data.flow;
        this.existingBot = data.bot;
        this.form = new FormGroup({
            input_variable: new FormControl(
                this.existingBot?.input_variable ?? 'message',
                [Validators.required]
            ),
            output_variable: new FormControl(
                this.existingBot?.output_variable ?? 'context',
                [Validators.required]
            ),
            enabled: new FormControl(this.existingBot?.enabled ?? true),
        });
    }

    ngOnInit(): void {}

    get isEditMode(): boolean {
        return this.existingBot !== null;
    }

    onSubmit(): void {
        if (this.form.invalid || this.isSubmitting()) return;
        this.isSubmitting.set(true);
        this.errorMessage.set(null);

        const value = this.form.value;

        if (this.isEditMode && this.existingBot) {
            this.storageService
                .updateBot(this.existingBot.id, this.flow.id, {
                    input_variable: value.input_variable,
                    output_variable: value.output_variable,
                    enabled: value.enabled,
                })
                .pipe(finalize(() => this.isSubmitting.set(false)))
                .subscribe({
                    next: () => this.dialogRef.close(),
                    error: () =>
                        this.errorMessage.set(
                            'Failed to save. Please try again.'
                        ),
                });
        } else {
            this.storageService
                .createBot({
                    flow: this.flow.id,
                    input_variable: value.input_variable,
                    output_variable: value.output_variable,
                    enabled: value.enabled,
                })
                .pipe(finalize(() => this.isSubmitting.set(false)))
                .subscribe({
                    next: (bot) => {
                        this.existingBot = bot;
                        this.dialogRef.close();
                    },
                    error: () =>
                        this.errorMessage.set(
                            'Failed to enable Matrix bot. Please try again.'
                        ),
                });
        }
    }

    onDisable(): void {
        if (!this.existingBot || this.isDeleting()) return;
        this.isDeleting.set(true);
        this.storageService
            .deleteBot(this.existingBot.id, this.flow.id)
            .pipe(finalize(() => this.isDeleting.set(false)))
            .subscribe({
                next: () => this.dialogRef.close(),
                error: () =>
                    this.errorMessage.set(
                        'Failed to disable. Please try again.'
                    ),
            });
    }

    onCancel(): void {
        this.dialogRef.close();
    }
}
