import { DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import {
    ButtonComponent,
    CustomInputComponent,
    IconButtonComponent, InputNumberComponent,
    KeyValueListComponent,
    SelectComponent, SliderWithStepperComponent, TextareaComponent, ValidationErrorsComponent
} from "@shared/components";
import { LlmModelSelectorComponent } from "../llm-model-selector/llm-model-selector.component";

@Component({
    selector: 'app-llm-model-config',
    templateUrl: './llm-model-config-dialog.component.html',
    styleUrls: ['./llm-model-config-dialog.component.scss'],
    imports: [
        IconButtonComponent,
        ButtonComponent,
        ReactiveFormsModule,
        CustomInputComponent,
        SelectComponent,
        KeyValueListComponent,
        SliderWithStepperComponent,
        InputNumberComponent,
        TextareaComponent,
        ValidationErrorsComponent,
        LlmModelSelectorComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LlmModelConfigDialogComponent implements OnInit {
    private fb = inject(FormBuilder);
    private destroyRef = inject(DestroyRef);
    dialogRef = inject(DialogRef);

    form!: FormGroup;

    ngOnInit() {
        this.form = this.fb.group({
            custom_name: ['', [Validators.required]],
            api_key: [''],
            temperature: [0.7],
            top_p: [1, [Validators.min(0.1)]],
            stop: [],
            max_tokens: [4096, [Validators.min(500), Validators.max(2147483647)]],
            presence_penalty: [null],
            frequency_penalty: [null],
            logit_bias: [],
            response_format: [],
            seed: [null, [Validators.min(-2147483648), Validators.max(2147483647)]],
            headers: [],
            extra_headers: [],
            timeout: [30, [Validators.min(1)]],
            is_visible: [],
            model: [],
        });
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onSave(): void {
        this.dialogRef.close();
    }
}
