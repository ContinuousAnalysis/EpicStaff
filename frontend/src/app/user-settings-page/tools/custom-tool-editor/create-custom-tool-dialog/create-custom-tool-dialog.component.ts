import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { editor as MonacoEditor } from 'monaco-editor';
import { EMPTY } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

import {
    CreatePythonCodeToolPayload,
    GetPythonCodeToolRequest,
} from '../../../../features/tools/models/python-code-tool.model';
import { CustomToolsService } from '../../../../features/tools/services/custom-tools/custom-tools.service';
import { ToastService } from '../../../../services/notifications';
import { AppSvgIconComponent } from '../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { ChipsInputComponent } from '../../../../shared/components/chips-input/chips-input.component';
import { CustomInputComponent } from '../../../../shared/components/form-input/form-input.component';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';
import { JsonEditorComponent } from '../../../../shared/components/json-editor/json-editor.component';
import { TextareaComponent } from '../../../../shared/components/textarea/textarea.component';
import { CodeEditorComponent } from '../code-editor/code-editor.component';
import { toCreatePayload } from './models/create-custom-tool-form.model';

enum ActiveEditor {
    None = 'none',
    Python = 'python',
    Json = 'json',
}

const DEFAULT_PYTHON_CODE = `def main() -> dict:
    return {"status": "ok"}
`;

const DEFAULT_VARIABLES_JSON = `[
  {
    "name": "query",
    "type": "string",
    "description": "Description of the parameter",
    "input_type": "user_input"
  }
]`;

@Component({
    selector: 'app-create-custom-tool-dialog',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        AppSvgIconComponent,
        ButtonComponent,
        ChipsInputComponent,
        CustomInputComponent,
        HelpTooltipComponent,
        CodeEditorComponent,
        JsonEditorComponent,
        TextareaComponent,
    ],
    templateUrl: './create-custom-tool-dialog.component.html',
    styleUrls: ['./create-custom-tool-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCustomToolDialogComponent {
    private readonly fb = inject(NonNullableFormBuilder);
    private readonly dialogRef = inject<DialogRef<GetPythonCodeToolRequest>>(DialogRef);
    private readonly destroyRef = inject(DestroyRef);
    private readonly customToolsService = inject(CustomToolsService);
    private readonly toast = inject(ToastService);

    public readonly form = this.fb.group({
        name: this.fb.control('', [Validators.required]),
        description: this.fb.control('', [Validators.required]),
        pythonCode: this.fb.control(DEFAULT_PYTHON_CODE, [Validators.required]),
        variablesJson: this.fb.control(DEFAULT_VARIABLES_JSON, [Validators.required]),
        libraries: this.fb.control<string[]>([]),
    });

    public readonly ActiveEditor = ActiveEditor;

    public readonly activeEditor = signal<ActiveEditor>(ActiveEditor.Python);
    public readonly pythonSectionExpanded = signal(false);
    public readonly jsonSectionExpanded = signal(false);
    public readonly isJsonValid = signal(true);
    public readonly pythonHasError = signal(false);
    public readonly isSaving = signal(false);

    private monacoJsonEditor: MonacoEditor.IStandaloneCodeEditor | null = null;

    constructor() {
        // Re-layout the JSON Monaco editor whenever it becomes visible again.
        // Both editors set `automaticLayout: true`, but the very first measure
        // can be off when the right pane is animated/expanded - manually call
        // layout() on the next microtask to be safe.
        effect(() => {
            const active = this.activeEditor();
            if (active === ActiveEditor.Json) {
                queueMicrotask(() => this.monacoJsonEditor?.layout());
            }
        });
    }

    public toggleEditor(target: ActiveEditor.Python | ActiveEditor.Json): void {
        const next = this.activeEditor() === target ? ActiveEditor.None : target;
        this.activeEditor.set(next);
        // Selecting a target for the right pane closes its inline preview to
        // avoid mounting two Monaco instances editing the same form control.
        if (next === ActiveEditor.Python) {
            this.pythonSectionExpanded.set(false);
        }
        if (next === ActiveEditor.Json) {
            this.jsonSectionExpanded.set(false);
        }
    }

    public isEditorActive(target: ActiveEditor.Python | ActiveEditor.Json): boolean {
        return this.activeEditor() === target;
    }

    public togglePythonSection(): void {
        const expanded = !this.pythonSectionExpanded();
        this.pythonSectionExpanded.set(expanded);
        if (expanded && this.activeEditor() === ActiveEditor.Python) {
            this.activeEditor.set(ActiveEditor.None);
        }
    }

    public toggleJsonSection(): void {
        const expanded = !this.jsonSectionExpanded();
        this.jsonSectionExpanded.set(expanded);
        if (expanded && this.activeEditor() === ActiveEditor.Json) {
            this.activeEditor.set(ActiveEditor.None);
        }
    }

    public copyPythonCode(): void {
        this.copyToClipboard(this.form.controls.pythonCode.value, 'Python code copied');
    }

    public copyJsonConfiguration(): void {
        this.copyToClipboard(this.form.controls.variablesJson.value, 'JSON configuration copied');
    }

    public onJsonChange(json: string): void {
        this.form.controls.variablesJson.setValue(json);
        this.form.controls.variablesJson.markAsDirty();
    }

    public onJsonValidationChange(isValid: boolean): void {
        this.isJsonValid.set(isValid);
    }

    public onJsonEditorReady(editor: MonacoEditor.IStandaloneCodeEditor): void {
        this.monacoJsonEditor = editor;
    }

    public onPythonCodeChange(code: string): void {
        this.form.controls.pythonCode.setValue(code);
        this.form.controls.pythonCode.markAsDirty();
    }

    public onPythonErrorChange(hasError: boolean): void {
        this.pythonHasError.set(hasError);
    }

    public closeEditorPane(): void {
        this.activeEditor.set(ActiveEditor.None);
    }

    public close(): void {
        this.dialogRef.close();
    }

    private copyToClipboard(value: string, successMessage: string): void {
        navigator.clipboard
            .writeText(value)
            .then(() => this.toast.success(successMessage))
            .catch(() => this.toast.error('Failed to copy to clipboard'));
    }

    public submit(): void {
        if (this.isSaving()) {
            return;
        }

        this.form.markAllAsTouched();

        const error = this.getValidationError();
        if (error) {
            this.toast.warning(error);
            return;
        }

        let payload: CreatePythonCodeToolPayload;
        try {
            payload = this.buildPayload();
        } catch {
            this.toast.error('Failed to parse JSON Configuration');
            return;
        }

        this.isSaving.set(true);

        this.customToolsService
            .createPythonCodeToolV2(payload)
            .pipe(
                tap((result) => {
                    this.toast.success('Custom tool created successfully!');
                    this.dialogRef.close(result);
                }),
                catchError((err: HttpErrorResponse) => {
                    console.error('Error creating tool:', err);
                    this.toast.error('Failed to create custom tool. Please try again.');
                    return EMPTY;
                }),
                finalize(() => this.isSaving.set(false)),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe();
    }

    private getValidationError(): string | null {
        if (this.form.invalid) {
            return 'Please fill in all required fields';
        }
        if (!this.isJsonValid()) {
            return 'JSON Configuration is invalid';
        }
        if (this.pythonHasError()) {
            return 'Fix Python code errors before saving';
        }
        return null;
    }

    private buildPayload(): CreatePythonCodeToolPayload {
        return toCreatePayload(this.form.getRawValue());
    }
}
