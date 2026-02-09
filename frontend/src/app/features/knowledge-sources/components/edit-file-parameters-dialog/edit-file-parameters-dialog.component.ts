import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    inject,
    signal,
    ViewChild
} from "@angular/core";
import { AppIconComponent, ButtonComponent } from "@shared/components";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { NaiveRagDocumentsStorageService } from "../../services/naive-rag-documents-storage.service";
import { DocumentChunksSectionComponent } from "../document-chunks-section/document-chunks-section.component";
import { TableDocument } from "../rag-configuration/configuration-table/configuration-table.interface";
import { DocumentConfigComponent } from "./document-config/document-config.component";

@Component({
    selector: 'app-edit-file-parameters-dialog',
    templateUrl: './edit-file-parameters-dialog.component.html',
    styleUrls: ['./edit-file-parameters-dialog.component.scss'],
    imports: [
        AppIconComponent,
        DocumentConfigComponent,
        DocumentChunksSectionComponent,
        ButtonComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditFileParametersDialogComponent {
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);
    private documentsStorageService = inject(NaiveRagDocumentsStorageService);
    readonly data: { ragId: number, ragDocumentId: number, allDocumentIds: number[] } = inject(DIALOG_DATA);

    @ViewChild('chunksSection', { static: true }) chunksSection!: DocumentChunksSectionComponent;
    @ViewChild('formSection', { static: true }) formSection!: DocumentConfigComponent;

    documents = this.documentsStorageService.documents;
    selectedDocumentId = signal<number>(this.data.ragDocumentId);

    document = computed<TableDocument>(() =>
        this.documents().find(d => d.naive_rag_document_id === this.selectedDocumentId())!
    );
    currentIndex = computed(() =>
        this.data.allDocumentIds.indexOf(this.selectedDocumentId())
    );
    isPrevDisabled = computed(() => this.currentIndex() <= 0);
    isNextDisabled = computed(() =>
        this.currentIndex() === -1 ||
        this.currentIndex() >= this.data.allDocumentIds.length - 1
    );

    nextDocument() {
        const index = this.currentIndex();
        if (index === -1 || index >= this.data.allDocumentIds.length - 1) {
            return;
        }

        this.selectedDocumentId.set(this.data.allDocumentIds[index + 1]);
    }

    prevDocument() {
        const index = this.currentIndex();
        if (index <= 0) {
            return;
        }

        this.selectedDocumentId.set(this.data.allDocumentIds[index - 1]);
    }

    onShowChunks() {
        const documentId = this.selectedDocumentId();
        const strategy = this.formSection.selectedStrategy() as string;
        const formData = this.formSection.form.value.strategyParams;
        if (!documentId || !strategy || !formData) return;

        const body = {
            chunk_strategy: strategy,
            ...formData.mainParams,
            additional_params: {
                [strategy]: {
                    ...formData.additionalParams,
                },
            }
        }


        this.documentsStorageService.updateDocumentFields(this.data.ragId, documentId, body)
            .subscribe(v => console.log(v));
        // this.chunksSection.runChunking()
    }

    onClose() {
        this.dialogRef.close();
    }
}
