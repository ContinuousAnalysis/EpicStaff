import { NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output } from "@angular/core";
import { AppIconComponent, ButtonComponent, SpinnerComponent } from "@shared/components";
import { EMPTY, filter } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { DocumentChunksStorageService } from "../../services/document-chunks-storage.service";
import { NaiveRagService } from "../../services/naive-rag.service";
import { ChunkPreviewComponent } from "./chunk-preview/chunk-preview.component";

@Component({
    selector: 'app-document-chunks-section',
    templateUrl: './document-chunks-section.component.html',
    styleUrls: ['./document-chunks-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        AppIconComponent,
        ButtonComponent,
        ChunkPreviewComponent,
        SpinnerComponent,
        NgTemplateOutlet
    ]
})
export class DocumentChunksSectionComponent {
    naiveRagId = input.required<number>();
    selectedDocumentId = input<number | null>(null);

    selectedDocState = computed(() => {
        const id = this.selectedDocumentId();
        if (!id) return;
        return this.chunksStorageService.documentStates().get(id);
    });

    private naiveRagService = inject(NaiveRagService);
    private chunksStorageService = inject(DocumentChunksStorageService);

    constructor() {
        effect(() => {
            const document = this.selectedDocState();
            if (!document) return;

            if (document.status === 'chunked') {
                this.chunksStorageService.fetchChunks(this.naiveRagId(), document.id).subscribe();
            }
        });
    }

    runChunking() {
        const documentId = this.selectedDocumentId();
        if (!documentId) return;

        const initialState = this.chunksStorageService.documentStates().get(documentId);
        if (!initialState) return;

        this.chunksStorageService.updateDocsState([documentId], s => ({ ...s, status: 'chunking' }));

        this.naiveRagService.runChunkingProcess(this.naiveRagId(), documentId).pipe(
            // TODO: handle chunking errors
            filter(r => r.status === 'completed'),

            tap(() => {
                const state = this.chunksStorageService.documentStates().get(documentId);
                if (state?.status === 'chunks_outdated') return;

                this.chunksStorageService.updateDocsState([documentId], s => ({ ...s, status: 'chunked' }));
            }),

            switchMap(() => {
                const state = this.chunksStorageService.documentStates().get(documentId);
                if (!state) return EMPTY;

                // prevent chunks fetching if document was updated
                if (state.status === 'chunks_outdated') return EMPTY;

                // prevent chunks fetching if user select other document
                if (this.selectedDocumentId() !== documentId) return EMPTY;

                return this.chunksStorageService.fetchChunks(this.naiveRagId(), documentId);
            })
        ).subscribe();
    }
}
