import { DialogRef } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import {
    ButtonComponent,
    CustomInputComponent,
    IconButtonComponent, InputNumberComponent,
    KeyValueListComponent, SliderWithStepperComponent, TextareaComponent, ValidationErrorsComponent
} from "@shared/components";
import { ToastService } from "../../../../services/notifications";
import { LLM_Model } from "../../models/llms/LLM.model";
import { LLM_Config_Service } from "../../services/llms/llm-config.service";
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
    private llmConfigService = inject(LLM_Config_Service);
    private toast = inject(ToastService);
    dialogRef = inject(DialogRef);

    isSaving = signal<boolean>(false);

    form!: FormGroup;

    ngOnInit() {
        this.form = this.fb.group({
            custom_name: ['', [Validators.required]],
            api_key: [''],
            temperature: [0.7],
            top_p: [1, [Validators.min(0.1)]],
            stop: [{}],
            max_tokens: [4096, [Validators.min(500), Validators.max(2147483647)]],
            presence_penalty: [null],
            frequency_penalty: [null],
            logit_bias: [{}],
            response_format: [null],
            seed: [null, [Validators.min(-2147483648), Validators.max(2147483647)]],
            headers: [{}],
            extra_headers: [{}],
            timeout: [30, [Validators.min(1)]],
            is_visible: [true],
            model: [],
        });
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onSave(): void {
        const formValue = this.form.value;

        this.isSaving.set(true);
        this.llmConfigService.createConfig(formValue)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toast.success('Configuration created successfully.');
                    this.dialogRef.close();
                },
                error: (err) => {
                    this.toast.error('Configuration creation failed.');
                    console.log(err);
                },
                complete: () => {
                    this.isSaving.set(false);
                }
            })

    }

    onModelChanged(model: LLM_Model): void {
        const modelControl = this.form.get('model');

        modelControl?.setValue(model.id)
    }
}
