import {
    ChangeDetectionStrategy,
    Component,
    computed, effect,
    inject,
    input,
    model,
    output,
    signal
} from "@angular/core";
import { KeyValuePipe } from "@angular/common";
import { UpdateNaiveRagDocumentDtoRequest } from "../../../models/naive-rag-document.model";
import {
    DocFieldChange,
    TableDocument,
} from "./configuration-table.interface";
import {
    SelectComponent,
    SelectItem,
    MultiSelectComponent,
    AppIconComponent,
    ButtonComponent,
    InputNumberComponent,
    CheckboxComponent
} from "@shared/components";
import { CHUNK_STRATEGIES, FILE_TYPES } from "../../../constants/constants";
import { Dialog } from "@angular/cdk/dialog";
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
export class ConfigurationTableComponent {
    fileTypeSelectItems: SelectItem[] = FILE_TYPES.map(t => ({ name: t, value: t }));
    chunkStrategySelectItems: SelectItem[] = CHUNK_STRATEGIES.map(t => ({ name: t, value: t.toLowerCase() }));

    private dialog = inject(Dialog);

    searchTerm = input<string>('');
    showBulkRow = input<boolean>(false);
    ragId = input.required<number>();
    documents = model<TableDocument[]>([]);
    selectedRagDocId = model<number | null>(null);

    docsCheckChange = output<number[]>();
    docFieldChange = output<DocFieldChange>();
    applyBulkUpdate = output<UpdateNaiveRagDocumentDtoRequest>();

    bulkChunkStrategy = signal<string | null>(null);
    bulkChunkSize = signal<number | null>(null);
    bulkChunkOverlap = signal<number | null>(null);
    fileTypeFilter = signal<any[]>([]);
    chunkStrategyFilter = signal<any[]>([]);

    allChecked = computed(() => {
        const arr = this.filteredDocuments();
        return arr.length > 0 && arr.every(r => r.checked);
    });
    checkedDocumentIds = computed(() => this.filteredDocuments()
        .filter(d => d.checked)
        .map(d => d.naive_rag_document_id)
    );
    indeterminate = computed(() => !!this.checkedDocumentIds().length && !this.allChecked());

    filteredDocuments = computed<TableDocument[]>(() => {
        let data = this.documents();

        data = this.applyFileNameFilter(data);
        data = this.applyFileTypeFilter(data);
        data = this.applyChunkStrategyFilter(data);

        return data;
    });

    constructor() {
        effect(() => {
            this.docsCheckChange.emit(this.checkedDocumentIds());
        });
    }

    onDocFieldChange(document: TableDocument, field: keyof TableDocument, value: string | number | null) {
        this.docFieldChange.emit({
            documentId: document.naive_rag_document_id,
            documentName: document.file_name,
            field,
            value
        });
    }

    toggleAll() {
        const all = this.allChecked();
        this.documents.update(items => items.map(i => ({ ...i, checked: !all })));
    }

    toggleDocument(item: TableDocument) {
        this.documents.update(items => items.map(i => {
            return i === item ? { ...i, checked: !i.checked } : i
        }));
    }

    parseFullFileName(fullName: string): { name: string, type: string } {
        const parts = fullName.split('.');
        const type = parts.pop()!;

        return {
            name: parts.join('.'),
            type: '.' + type
        };
    }

    tuneChunk(docRagId: number) {
        this.dialog.open(EditFileParametersDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: {
                ragId: this.ragId(),
                docRagId
            },
            disableClose: true
        });
    }

    onApplyBulkEdit() {
        const dto = {
            ...(this.bulkChunkStrategy() && {
                chunk_strategy: this.bulkChunkStrategy()
            }),

            ...(this.bulkChunkSize() !== null && {
                chunk_size: this.bulkChunkSize()
            }),

            ...(this.bulkChunkOverlap() !== null && {
                chunk_overlap: this.bulkChunkOverlap()
            }),
        } as UpdateNaiveRagDocumentDtoRequest;

        this.applyBulkUpdate.emit(dto)
    }

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
