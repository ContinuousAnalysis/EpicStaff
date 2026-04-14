import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import {
    AbstractControl,
    ControlValueAccessor,
    NG_VALIDATORS,
    NG_VALUE_ACCESSOR,
    ValidationErrors,
    Validator,
} from '@angular/forms';

import { TooltipComponent } from '../tooltip/tooltip.component';
import { JsonEditorComponent } from './json-editor.component';

@Component({
    selector: 'app-json-editor-form-field',
    imports: [JsonEditorComponent, TooltipComponent],
    templateUrl: './json-editor-form-field.component.html',
    styleUrls: ['./json-editor-form-field.component.scss'],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => JsonEditorFormFieldComponent),
            multi: true,
        },
        {
            provide: NG_VALIDATORS,
            useExisting: forwardRef(() => JsonEditorFormFieldComponent),
            multi: true,
        },
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonEditorFormFieldComponent implements ControlValueAccessor, Validator {
    label = input<string>('');
    tooltipText = input<string>('');
    required = input<boolean>(false);

    title = input<string>('JSON Editor');
    editorHeight = input<number>(200);
    fullHeight = input<boolean>(false);
    showHeader = input<boolean>(false);
    collapsible = input<boolean>(false);
    allowCopy = input<boolean>(false);
    readOnly = input<boolean>(false);
    writeValueAsJSON = input<boolean>(true);

    jsonValue = signal<string>('{}');
    isDisabled = signal<boolean>(false);
    isValid = signal<boolean>(true);

    editorOptions: Record<string, unknown> = {
        theme: 'vs-dark',
        language: 'json',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        wrappingIndent: 'indent',
        lineNumbers: 'off',
        wordWrapBreakAfterCharacters: ',',
        wordWrapBreakBeforeCharacters: '}]',
        formatOnPaste: true,
        formatOnType: true,
        tabSize: 2,
        readOnly: false,
    };

    private onChange: (value: string) => void = () => {};
    private onTouched: () => void = () => {};
    private onValidatorChange: () => void = () => {};

    onJsonChange(value: string): void {
        const onChangeValue = this.writeValueAsJSON() ? value : JSON.parse(value);

        this.jsonValue.set(value);
        this.onChange(onChangeValue);
        this.onTouched();
    }

    onValidationChange(valid: boolean): void {
        this.isValid.set(valid);
        this.onValidatorChange();
    }

    validate(_: AbstractControl): ValidationErrors | null {
        void _;
        return this.isValid() ? null : { invalidJson: true };
    }

    registerOnValidatorChange(fn: () => void): void {
        this.onValidatorChange = fn;
    }

    writeValue(value: unknown): void {
        if (value == null) {
            this.jsonValue.set('{}');
        } else if (typeof value === 'string') {
            this.jsonValue.set(value);
        } else {
            this.jsonValue.set(JSON.stringify(value, null, 2));
        }
    }

    registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.isDisabled.set(isDisabled);
    }
}
