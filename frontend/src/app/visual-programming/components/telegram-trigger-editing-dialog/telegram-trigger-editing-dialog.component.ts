import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    OnInit,
    signal
} from "@angular/core";
import {AppIconComponent} from "../../../shared/components/app-icon/app-icon.component";
import {DIALOG_DATA, DialogRef} from "@angular/cdk/dialog";

import {SearchComponent} from "../../../shared/components/search/search.component";
import {TelegramTriggerFieldsTableComponent} from "./fields-table/fields-table.component";
import {JsonEditorComponent} from "../../../shared/components/json-editor/json-editor.component";
import {
    DisplayedTelegramField,
} from "../../../pages/flows-page/components/flow-visual-programming/models/telegram-trigger.model";
import {TELEGRAM_TRIGGER_FIELDS} from "../../core/constants/telegram-trigger-fields";
import {ToastService} from "../../../services/notifications/toast.service";
import {VARIABLE_PREFIX} from "../../core/constants/telegram-field-variable-path-prefix";
import {MATERIAL_FORMS} from "../../../shared/material-forms";

export interface TableItem extends DisplayedTelegramField {
    checked: boolean;
}

@Component({
    selector: 'app-telegram-trigger-editing-dialog',
    templateUrl: './telegram-trigger-editing-dialog.component.html',
    styleUrls: ['./telegram-trigger-editing-dialog.component.scss'],
    imports: [
        AppIconComponent,
        SearchComponent,
        TelegramTriggerFieldsTableComponent,
        JsonEditorComponent,
        MATERIAL_FORMS,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelegramTriggerEditingDialogComponent implements OnInit {
    private dialogRef = inject(DialogRef);
    private toastService = inject(ToastService);
    selectedFields: DisplayedTelegramField[] = inject(DIALOG_DATA);

    searchTerm = signal<string>('');
    tableItems = signal<TableItem[]>([]);

    checkedItems = computed<DisplayedTelegramField[]>(() => {
        return this.tableItems()
            .filter(i => i.checked)
            .map(({checked, ...rest}) => rest);
    });

    hasInvalidItems = computed(() => {
        const items = this.checkedItems();
        return items.some(item => item.variable_path === VARIABLE_PREFIX);
    });

    jsonValues = computed(() => {
        const checkedItemsObj = this.checkedItems().reduce<Record<string, any>>((acc, field) => {
            acc[field.field_name] = field.model;
            return acc;
        }, {});

        return JSON.stringify(checkedItemsObj, null, 2);
    });

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

    ngOnInit() {
        this.setTableItems();
    }

    setTableItems() {
        const selectedFieldsMap = new Map(
            this.selectedFields.map(f => [`${f.parent}:${f.field_name}`, f])
        );

        const messageFieldsTableItems: TableItem[] = TELEGRAM_TRIGGER_FIELDS.message.map(field => {
            const selectedItem = selectedFieldsMap.get(`message:${field.field_name}`)
            return {
                ...field,
                parent: 'message',
                variable_path: selectedItem?.variable_path || VARIABLE_PREFIX,
                checked: !!selectedItem,
            }
        });

        const callbackQueryFieldsTableItems: TableItem[] = TELEGRAM_TRIGGER_FIELDS.callback_query.map(field => {
            const selectedItem = selectedFieldsMap.get(`callback_query:${field.field_name}`)
            return {
                ...field,
                parent: 'callback_query',
                variable_path: selectedItem?.variable_path || VARIABLE_PREFIX,
                checked: !!selectedItem,
            }
        });
        this.tableItems.set([...messageFieldsTableItems, ...callbackQueryFieldsTableItems]);
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onSave(): void {
        if (this.hasInvalidItems()) {
            this.toastService.error('Please enter variable path for all selected items');
            return;
        }

        const result = this.checkedItems();
        this.dialogRef.close(result);
    }
}
