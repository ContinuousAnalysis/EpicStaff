import {
    ChangeDetectionStrategy,
    Component, computed,
    DestroyRef,
    inject,
    input,
    OnInit,
    signal,
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {SearchComponent, AppIconComponent, ButtonComponent} from "@shared/components";
import {ConfigurationTableComponent} from "./configuration-table/configuration-table.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CreateCollectionDtoResponse} from "../../models/collection.model";
import {NaiveRagService} from "../../services/naive-rag.service";
import {
    BulkDeleteNaiveRagDocumentDtoResponse,
    BulkUpdateNaiveRagDocumentDtoResponse,
    NaiveRagDocumentConfig, UpdateNaiveRagDocumentConfigError, UpdateNaiveRagDocumentDtoRequest,
    UpdateNaiveRagDocumentResponse
} from "../../models/rag.model";
import {ToastService} from "../../../../services/notifications";
import {ChunkPreviewComponent} from "../chunk-preview/chunk-preview.component";
import {catchError, debounceTime, map, switchMap, tap} from "rxjs/operators";
import {EMPTY, groupBy, mergeMap, of, Subject} from "rxjs";
import {
    DocFieldChange,
    NormalizedDocumentErrors,
    TableDocument
} from "./configuration-table/configuration-table.interface";
import {HttpErrorResponse} from "@angular/common/http";

@Component({
    selector: 'app-rag-configuration',
    templateUrl: './rag-configuration.component.html',
    styleUrls: ['./rag-configuration.component.scss'],
    imports: [
        FormsModule,
        SearchComponent,
        ConfigurationTableComponent,
        AppIconComponent,
        ChunkPreviewComponent,
        ButtonComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RagConfigurationComponent implements OnInit {
    naiveRagId = input.required<number>();
    collection = input.required<CreateCollectionDtoResponse>();

    searchTerm = signal<string>('');
    bulkBtnActive = signal<boolean>(false);
    documents = signal<TableDocument[]>([]);
    selectedDocumentId = signal<number | null>(null);
    filteredAndCheckedDocIds = signal<number[]>([]);

    showBulkRow = computed(() => this.bulkBtnActive() && !!this.filteredAndCheckedDocIds().length);

    private naiveRagService = inject(NaiveRagService);
    private destroyRef = inject(DestroyRef);
    private toastService = inject(ToastService);

    private docFieldChange$ = new Subject<DocFieldChange>();

    ngOnInit() {
        this.fetchDocumentConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(configs => this.documents.set(configs));

        this.docFieldChange$.pipe(
            groupBy(change => change.documentId),
            mergeMap(group$ => group$.pipe(
                debounceTime(300),
                switchMap(change => this.updateDocumentField(change))
            )),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    onDocFieldChange(change: DocFieldChange) {
        this.docFieldChange$.next(change);
    }

    initFiles() {
        const id = this.naiveRagId();

        this.naiveRagService.initializeDocuments(id)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                switchMap(response => {
                    if (response && response.configs_created > 0) {
                        return this.fetchDocumentConfigs();
                    } else {
                        return EMPTY;
                    }
                }),
            )
            .subscribe(configs => this.documents.set(configs));
    }

    private fetchDocumentConfigs() {
        const id = this.naiveRagId();

        return this.naiveRagService.getDocumentConfigs(id).pipe(
            map(({ configs }) => this.toTableDocuments(configs)),
            catchError(e => {
                this.toastService.error('Failed to fetch documents');
                console.log(e);
                return EMPTY;
            }),
        );
    }

    private toTableDocuments(documents: NaiveRagDocumentConfig[]): TableDocument[] {
        return documents.map(d => ({...d, checked: false}));
    }

    private updateDocumentField(change: DocFieldChange) {
        const { documentId, field, value } = change;
        const id = this.naiveRagId();
        if (value === null) return EMPTY;

        return this.naiveRagService.updateDocumentConfigById(
            id,
            documentId,
            { [field]: value }
        ).pipe(
            tap(response => this.handleUpdateSuccess(response)),
            catchError(error => this.handleUpdateError(error, field, documentId))
        );
    }

    private handleUpdateSuccess(response: UpdateNaiveRagDocumentResponse) {
        const { config } = response;

        this.documents.update(items =>
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

        this.documents.update(items =>
            items.map(item => {
                return item.naive_rag_document_id === documentId ? { ...item, errors: {[field]: {reason: errorMessage}} } : item;
            })
        );
        this.toastService.error(`Update failed: ${errorMessage}`);

        return EMPTY;
    }

    // ================= BULK LOGIC START =================

    applyBulkEdit(dto: UpdateNaiveRagDocumentDtoRequest) {
        const config_ids = this.filteredAndCheckedDocIds();
        if (!config_ids.length) return;
        const id = this.naiveRagId();

        this.naiveRagService
            .bulkUpdateDocumentConfigs(id, {config_ids, ...dto})
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(res => this.hangleBulkEdit(res));
    }

    private hangleBulkEdit(res: BulkUpdateNaiveRagDocumentDtoResponse) {
        this.toastService.success(res.message);

        const configMap = new Map(
            res.configs.map(c => [c.document_id, c])
        );

        this.documents.update(items =>
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
        const config_ids = this.filteredAndCheckedDocIds();
        if (!config_ids.length) return;
        const id = this.naiveRagId();

        this.naiveRagService
            .bulkDeleteDocumentConfigs(id, { config_ids })
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
        this.documents.update(items => items.filter(i => {
            return !res.deleted_config_ids.includes(i.naive_rag_document_id);
        }))
        this.toastService.success(res.message);
    }

    // ================= BULK LOGIC END =================
}
