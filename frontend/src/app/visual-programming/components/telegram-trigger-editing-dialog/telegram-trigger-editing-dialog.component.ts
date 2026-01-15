import {ChangeDetectionStrategy, Component, DestroyRef, inject} from "@angular/core";
import {AppIconComponent} from "../../../shared/components/app-icon/app-icon.component";
import {DIALOG_DATA, DialogRef} from "@angular/cdk/dialog";

import {SearchComponent} from "../../../shared/components/search/search.component";
import {SelectComponent} from "../../../shared/components/select/select.component";
import {TelegramTriggerFieldsTableComponent} from "./fields-table/fields-table.component";
import {JsonEditorComponent} from "../../../shared/components/json-editor/json-editor.component";

@Component({
    selector: 'app-telegram-trigger-editing-dialog',
    templateUrl: './telegram-trigger-editing-dialog.component.html',
    styleUrls: ['./telegram-trigger-editing-dialog.component.scss'],
    imports: [
        AppIconComponent,
        SearchComponent,
        SelectComponent,
        TelegramTriggerFieldsTableComponent,
        JsonEditorComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelegramTriggerEditingDialogComponent {
    data: { } = inject(DIALOG_DATA);
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);

    editorOptions: any = {
        lineNumbers: 'off',
        theme: 'vs-dark',
        language: 'json',
        automaticLayout: true,
        minimap: {enabled: false},
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        wrappingIndent: 'indent',
        wordWrapBreakAfterCharacters: ',',
        wordWrapBreakBeforeCharacters: '}]',
        tabSize: 2,
        readOnly: true,
    };

    onCancel(): void {
        this.dialogRef.close();
    }
}
