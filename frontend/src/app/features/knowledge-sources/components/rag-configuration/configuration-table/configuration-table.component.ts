import {
    ChangeDetectionStrategy,
    Component,
    computed, DestroyRef, effect,
    inject,
    input,
    linkedSignal, model,
    OnInit, output,
    signal
} from "@angular/core";
import {HttpErrorResponse} from "@angular/common/http";
import {KeyValuePipe} from "@angular/common";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {EMPTY, groupBy, mergeMap, of, Subject} from "rxjs";
import {catchError, debounceTime, switchMap, tap} from "rxjs/operators";
import {ToastService} from "../../../../../services/notifications";
import {NaiveRagService} from "../../../services/naive-rag.service";
import {
    DocFieldChange,
    TableDocument,
    NormalizedDocumentErrors
} from "./configuration-table.interface";
import {SelectComponent, SelectItem, MultiSelectComponent, AppIconComponent, ButtonComponent, InputNumberComponent, CheckboxComponent} from "@shared/components";
import {CHUNK_STRATEGIES, FILE_TYPES} from "../../../constants/constants";
import {
    BulkDeleteNaiveRagDocumentDtoResponse,
    BulkUpdateNaiveRagDocumentDtoRequest, BulkUpdateNaiveRagDocumentDtoResponse,
    NaiveRagDocumentConfig, UpdateNaiveRagDocumentConfigError,
    UpdateNaiveRagDocumentResponse
} from "../../../models/rag.model";
import {Dialog} from "@angular/cdk/dialog";
import {
    EditFileParametersDialogComponent
} from "../../edit-file-parameters-dialog/edit-file-parameters-dialog.component";

@Component({
    selector: 'app-configuration-table',
    templateUrl: './configuration-table.component.html',
    styleUrls: ['./configuration-table.component.scss'],
    imports: [
        SelectComponent,
        AppIconComponent,
        ButtonComponent,
        InputNumberComponent,
        CheckboxComponent,
        MultiSelectComponent,
        KeyValuePipe,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfigurationTableComponent implements OnInit {
    fileTypeSelectItems: SelectItem[] = FILE_TYPES.map(t => ({name: t, value: t}));
    chunkStrategySelectItems: SelectItem[] = CHUNK_STRATEGIES.map(t => ({name: t, value: t.toLowerCase()}));

    private dialog = inject(Dialog);
    private naiveRagService = inject(NaiveRagService);
    private destroyRef = inject(DestroyRef);
    private toastService = inject(ToastService);
    private docFieldChange$ = new Subject<DocFieldChange>();

    ragId = input.required<number>();
    documents = input<NaiveRagDocumentConfig[]>([]);
    searchTerm = input<string>('');
    tableDocuments = linkedSignal<TableDocument[]>(() => {
        return this.documents().map(d => ({...d, checked: false}))
    });

    allChecked = computed(() => {
        const arr = this.filteredDocuments();
        return arr.length > 0 && arr.every(r => r.checked);
    });
    checkedDocumentIds = computed(() => this.filteredDocuments()
        .filter(d => d.checked)
        .map(d => d.naive_rag_document_id)
    );
    indeterminate = computed(() => !!this.checkedDocumentIds().length && !this.allChecked());
    checkedCountChange = output<number>();

    selectedDocumentId = model<number | null>(null);

    bulkChunkStrategy = signal<string | null>(null);
    bulkChunkSize = signal<number | null>(null);
    bulkChunkOverlap = signal<number | null>(null);
    showBulkRow = input<boolean>(false);

    fileTypeFilter = signal<any[]>([]);
    chunkStrategyFilter = signal<any[]>([]);

    filteredDocuments = computed<TableDocument[]>(() => {
        let data = this.tableDocuments();

        data = this.applyFileNameFilter(data);
        data = this.applyFileTypeFilter(data);
        data = this.applyChunkStrategyFilter(data);

        return data;
    });

    constructor() {
        effect(() => {
            this.checkedCountChange.emit(this.checkedDocumentIds().length);
        });
    }

    ngOnInit() {
        this.docFieldChange$.pipe(
            groupBy(change => change.documentId),
            mergeMap(group$ => group$.pipe(
                debounceTime(300),
                switchMap(change => this.updateDocumentField(change))
            )),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    toggleAll() {
        const all = this.allChecked();
        this.tableDocuments.update(items => items.map(i => ({ ...i, checked: !all })));
    }

    toggleDocument(item: TableDocument) {
        this.tableDocuments.update(items => items.map(i => {
            return i === item ? { ...i, checked: !i.checked } : i
        }));
    }

    parseFullFileName(fullName: string): {name: string, type: string} {
        const parts = fullName.split('.');
        const type = parts.pop()!;

        return {
            name: parts.join('.'),
            type: '.' + type
        };
    }

    tuneChunk(row: any) {
        this.dialog.open(EditFileParametersDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: {},
            disableClose: true
        });
    }

    // ================= FILED CHANGE LOGIC START =================

    docFieldChange(document: TableDocument, field: keyof TableDocument, value: string | number | null) {
        this.docFieldChange$.next({
            documentId: document.naive_rag_document_id,
            documentName: document.file_name,
            field,
            value
        });
    }

    private updateDocumentField(change: DocFieldChange) {
        const { documentId, field, value } = change;
        if (value === null) return EMPTY;

        return this.naiveRagService.updateDocumentConfigById(
            this.ragId(),
            documentId,
            { [field]: value }
        ).pipe(
            tap(response => this.handleUpdateSuccess(response)),
            catchError(error => this.handleUpdateError(error, field, documentId))
        );
    }

    private handleUpdateSuccess(response: UpdateNaiveRagDocumentResponse) {
        const { config } = response;

        this.tableDocuments.update(items =>
            items.map(i =>
                i.document_id === config.document_id ? { ...i, ...config, errors: {} } : i
            )
        );
        this.toastService.success('Document updated');
    }

    private handleUpdateError(
        error: HttpErrorResponse,
        field: keyof TableDocument,
        documentId: number
    ) {
        const errorMessage = error.error.error;

        this.tableDocuments.update(items =>
            items.map(item => {
                return item.naive_rag_document_id === documentId ? { ...item, errors: {[field]: {reason: errorMessage}} } : item;
            })
        );
        this.toastService.error(`Update failed: ${errorMessage}`);

        return EMPTY;
    }

    // ================= FILED CHANGE LOGIC END =================

    // ================= BULK LOGIC START =================

    applyBulkEdit() {
        const config_ids = this.checkedDocumentIds();
        if (!config_ids.length) return;

        const dto = {
            config_ids,
            ...(this.bulkChunkStrategy() && {
                chunk_strategy: this.bulkChunkStrategy()
            }),

            ...(this.bulkChunkSize() !== null && {
                chunk_size: this.bulkChunkSize()
            }),

            ...(this.bulkChunkOverlap() !== null && {
                chunk_overlap: this.bulkChunkOverlap()
            }),
        } as BulkUpdateNaiveRagDocumentDtoRequest;

        this.naiveRagService
            .bulkUpdateDocumentConfigs(this.ragId(), dto)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(res => this.hangleBulkEdit(res));
    }

    private hangleBulkEdit(res: BulkUpdateNaiveRagDocumentDtoResponse) {
        this.toastService.success(res.message);

        const configMap = new Map(
            res.configs.map(c => [c.document_id, c])
        );

        this.tableDocuments.update(items =>
            items.map(item => {
                const updated = configMap.get(item.document_id);

                if (!updated) return item;

                return {
                    ...item,
                    ...updated,

                    errors: this.normalizeErrors(updated.errors)
                };
            })
        );
    }

    private normalizeErrors(
        errors?: UpdateNaiveRagDocumentConfigError[]
    ): NormalizedDocumentErrors {
        if (!errors?.length) return {};

        return errors.reduce((acc, e) => {
            acc[e.field] = { reason: e.reason, value: e.value };
            return acc;
        }, {} as NormalizedDocumentErrors);
    }

    public applyBulkDelete() {
        const config_ids = this.checkedDocumentIds();
        if (!config_ids.length) return;

        this.naiveRagService
            .bulkDeleteDocumentConfigs(this.ragId(), { config_ids })
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                catchError(() => {
                    this.toastService.error('Documents delete failed');
                    return of();
                })
            )
            .subscribe(res => this.handleSuccessBulkDelete(res));
    }

    private handleSuccessBulkDelete(res: BulkDeleteNaiveRagDocumentDtoResponse) {
        this.tableDocuments.update(items => items.filter(i => {
            return !res.deleted_config_ids.includes(i.naive_rag_document_id);
        }))
        this.toastService.success(res.message);
    }

    // ================= BULK LOGIC END =================

    // ================= FILTER LOGIC START =================

    private applyFileNameFilter(data: TableDocument[]): TableDocument[] {
        const term = this.searchTerm();

        return data.filter(d => {
            return d.file_name.toLowerCase().includes(term.toLowerCase());
        });
    }

    private applyFileTypeFilter(data: TableDocument[]): TableDocument[] {
        const filesFilter = this.fileTypeFilter();
        if (!filesFilter.length) return data;

        return data.filter(d => {
            const ext = d.file_name.split('.').pop()?.toLowerCase();
            return ext && filesFilter.includes(ext);
        });
    }

    private applyChunkStrategyFilter(data: TableDocument[]): TableDocument[] {
        const strategyFilter = this.chunkStrategyFilter();
        if (!strategyFilter.length) return data;

        return data.filter(d => strategyFilter.includes(d.chunk_strategy));
    }

    // ================= FILTER LOGIC END =================
}
