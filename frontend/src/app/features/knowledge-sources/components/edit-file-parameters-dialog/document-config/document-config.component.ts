import {ChangeDetectionStrategy, Component, inject, input, signal} from "@angular/core";
import {MATERIAL_FORMS} from "@shared/material-forms";
import {SelectComponent} from "@shared/components";
import {CHUNK_STRATEGIES_SELECT_ITEMS} from "../../../constants/constants";

import {JsonEditorComponent} from "@shared/components";
import {FormBuilder, FormGroup, Validators} from "@angular/forms";
import {MarkdownFormComponent} from "./strategies-forms/markdown-form/markdown-form.component";
import {CharacterFormComponent} from "./strategies-forms/character-form/character-form.component";
import {CsvFormComponent} from "./strategies-forms/csv-form/csv-form.component";
import {HtmlFormComponent} from "./strategies-forms/html-form/html-form.component";
import {TokenFormComponent} from "./strategies-forms/token-form/token-form.component";
import {JsonFormComponent} from "./strategies-forms/json-form/json-form.component";


@Component({
    selector: 'app-document-config',
    templateUrl: './document-config.component.html',
    styleUrls: ['./document-config.component.scss'],
    imports: [
        MATERIAL_FORMS,
        SelectComponent,
        JsonEditorComponent,
        MarkdownFormComponent,
        CharacterFormComponent,
        CsvFormComponent,
        HtmlFormComponent,
        TokenFormComponent,
        JsonFormComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentConfigComponent {
    private fb = inject(FormBuilder);

    document = input.required<any>();
    selectedStrategy = signal<string>('markdown');
    jsonConfig = signal<string>(JSON.stringify({}));
    public isJsonValid = signal<boolean>(true);
    public form!: FormGroup;

    //TODO create model for params
    public params: any = {};

    constructor() {
        this.form = this.fb.group({
            strategy: ['', Validators.required],
        });

        this.form.valueChanges.subscribe(v => console.log(v));
    }

    public onJsonValidChange(isValid: boolean): void {
        this.isJsonValid.set(isValid);
    }

    protected readonly chunkStrategySelectItems = CHUNK_STRATEGIES_SELECT_ITEMS;
}
