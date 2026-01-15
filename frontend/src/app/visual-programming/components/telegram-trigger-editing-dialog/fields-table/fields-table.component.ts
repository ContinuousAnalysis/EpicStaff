import {
    ChangeDetectionStrategy,
    Component,
    computed, DestroyRef, effect,
    inject,
    input,
    linkedSignal,
    OnInit, output,
} from "@angular/core";
import {HttpErrorResponse} from "@angular/common/http";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {EMPTY, groupBy, mergeMap, of, Subject} from "rxjs";
import {catchError, debounceTime, switchMap, tap} from "rxjs/operators";
import {CheckboxComponent} from "../../../../shared/components/checkbox/checkbox.component";
import {SelectComponent, SelectItem} from "../../../../shared/components/select/select.component";
import {AppIconComponent} from "../../../../shared/components/app-icon/app-icon.component";
import {ToastService} from "../../../../services/notifications/toast.service";
import {CustomInputComponent} from "../../../../shared/components/form-input/form-input.component";

interface TelegramTriggerTableField {
    id: number;
    default_name: string;
    type: string;
    assigned_name: string;
    description: string;
}

interface TableItem extends TelegramTriggerTableField {
    checked: boolean;
    errors?: Object;
}

interface TableFieldChange {
    id: number;
    default_name: string;
    field: string;
    value: string | null;
}

@Component({
    selector: 'app-telegram-fields-table',
    templateUrl: './fields-table.component.html',
    styleUrls: ['./fields-table.component.scss'],
    imports: [
        SelectComponent,
        CheckboxComponent,
        CheckboxComponent,
        SelectComponent,
        AppIconComponent,
        CustomInputComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TelegramTriggerFieldsTableComponent implements OnInit {
    fileTypeSelectItems: SelectItem[] = [
        {
            name: 'Integer',
            value: 'integer',
        },
        {
            name: 'String',
            value: 'string',
        },
        {
            name: 'Chat',
            value: 'chat',
        },
        {
            name: 'Message',
            value: 'message',
        },
    ];

    private destroyRef = inject(DestroyRef);
    private toastService = inject(ToastService);
    private tableFieldChange$ = new Subject<TableFieldChange>();

    fields = input<TelegramTriggerTableField[]>([
        {
            id: 1,
            default_name: 'message_id',
            type: 'integer',
            assigned_name: '',
            description: 'Unique message identifier inside this chat. In specific instances (e.g., message containing a video sent to a big chat), the server might automatically schedule a message instead of sending it immediately. In such cases, this field will be 0 and the relevant message will be unusable until it is actually sent.',
        },
        {
            id: 2,
            default_name: 'date',
            type: 'integer',
            assigned_name: '',
            description: 'Date the message was sent in Unix time. It is always a positive number, representing a valid date.',
        },
        {
            id: 3,
            default_name: 'chat',
            type: 'chat',
            assigned_name: '',
            description: 'Chat the message belongs to',
        },
        {
            id: 4,
            default_name: 'text',
            type: 'string',
            assigned_name: '',
            description: 'Optional. For text messages, the actual UTF-8 text of the message.',
        },
        {
            id: 5,
            default_name: 'location',
            type: 'string',
            assigned_name: '',
            description: 'Optional. Message is shared location, information about location',
        },
    ]);
    searchTerm = input<string>('');
    tableItems = linkedSignal<TableItem[]>(() => {
        return this.fields().map(d => ({...d, checked: false}))
    });

    allChecked = computed(() => {
        const arr = this.tableItems();
        return arr.length > 0 && arr.every(r => r.checked);
    });
    checkedItemIds = computed(() => this.tableItems()
        .filter(d => d.checked)
        .map(d => d.id)
    );
    indeterminate = computed(() => !!this.checkedItemIds().length && !this.allChecked());
    checkedCountChange = output<number>();


    constructor() {
        effect(() => {
            this.checkedCountChange.emit(this.checkedItemIds().length);
        });
    }

    ngOnInit() {
        this.tableFieldChange$.pipe(
            groupBy(change => change.id),
            mergeMap(group$ => group$.pipe(
                debounceTime(300),
                switchMap(change => this.updateDocumentField(change))
            )),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    toggleAll() {
        const all = this.allChecked();
        this.tableItems.update(items => items.map(i => ({ ...i, checked: !all })));
    }

    toggleItem(item: TableItem) {
        this.tableItems.update(items => items.map(i => {
            return i === item ? { ...i, checked: !i.checked } : i
        }));
    }

    // ================= FILED CHANGE LOGIC START =================

    itemFieldChange(item: TableItem, field: string, value: string | null) {
        this.tableFieldChange$.next({
            id: item.id,
            default_name: item.default_name,
            field,
            value
        });
    }

    private updateDocumentField(change: TableFieldChange) {
        return of()
        // const { documentId, field, value } = change;
        // if (value === null) return EMPTY;
        //
        // return this.naiveRagService.updateDocumentConfigById(
        //     this.ragId(),
        //     documentId,
        //     { [field]: value }
        // ).pipe(
        //     tap(response => this.handleUpdateSuccess(response)),
        //     catchError(error => this.handleUpdateError(error, field, documentId))
        // );
    }

    private handleUpdateSuccess(response: any) {
        const { config } = response;

        this.tableItems.update(items =>
            items.map(i =>
                i.id === config.id ? { ...i, ...config, errors: {} } : i
            )
        );
        this.toastService.success('Document updated');
    }

    private handleUpdateError(
        error: HttpErrorResponse,
        field: string,
        id: number
    ) {
        const errorMessage = error.error.error;

        this.tableItems.update(items =>
            items.map(item => {
                return item.id === id ? { ...item, errors: {[field]: {reason: errorMessage}} } : item;
            })
        );
        this.toastService.error(`Update failed: ${errorMessage}`);

        return EMPTY;
    }

    // ================= FILED CHANGE LOGIC END =================


}
