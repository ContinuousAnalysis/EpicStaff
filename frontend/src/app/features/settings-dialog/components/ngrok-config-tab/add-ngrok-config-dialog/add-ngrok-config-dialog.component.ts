import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, inject, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import {
    ButtonComponent,
    CustomInputComponent,
    SelectComponent,
    SelectItem,
    ValidationErrorsComponent
} from "@shared/components";
import { GetNgrokConfigResponse } from "../../../models/ngrok-config.model";

@Component({
    selector: 'app-create-ngrok-config-dialog',
    templateUrl: './add-ngrok-config-dialog.component.html',
    styleUrls: ['./add-ngrok-config-dialog.component.scss'],
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        SelectComponent,
        ButtonComponent,
        ValidationErrorsComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddNgrokConfigDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private dialogRef = inject(DialogRef);
    data: { config: GetNgrokConfigResponse | null, action: 'create' | 'update' } = inject(DIALOG_DATA);


    form!: FormGroup;
    regionSelectItems: SelectItem[] = [
        {
            name: 'EU',
            value: 'eu',
        },
        {
            name: 'US',
            value: 'us',
        },
        {
            name: 'AP',
            value: 'ap',
        },
    ];

    ngOnInit() {
        this.initForm()
    }

    private initForm(): void {
        this.form = this.fb.group({
            name: [this.data.config?.name || '', Validators.required],
            auth_token: [this.data.config?.auth_token || '', Validators.required],
            region: [this.data.config?.region || 'eu'],
            domain: [this.data.config?.domain || ''],
        })
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.dialogRef.close(this.form.value);
    }

    onCancel(): void {
        this.dialogRef.close();
    }
}
