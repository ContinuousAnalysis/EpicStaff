import { inject, Injectable, signal } from "@angular/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { TableDocument } from "../components/rag-configuration/configuration-table/configuration-table.interface";
import {
    DocumentChunkingState,
    DocumentWithChunksStatus,
    GetNaiveRagDocumentChunksResponse
} from "../models/naive-rag-chunk.model";
import { NaiveRagService } from "./naive-rag.service";

@Injectable({
    providedIn: 'root'
})
export class DocumentChunksStorageService {
    private documentStatesSignal = signal<Map<number, DocumentChunkingState>>(new Map());
    public documentStates = this.documentStatesSignal.asReadonly();

    private readonly naiveRagService = inject(NaiveRagService);

    public initDocumentStatesMap(documents: TableDocument[]): void {
        const docStateMap = new Map<number, DocumentChunkingState>();
        documents.forEach(doc => {
            let status: DocumentWithChunksStatus;

            switch (doc.status) {
                case 'new':
                    status = 'new';
                    break;
                case 'chunked':
                    status = 'chunked';
                    break;
                default:
                    status = 'chunking_failed';
            }

            docStateMap.set(doc.document_id, { id: doc.document_id, status: status, chunks: [] });
        });
        this.documentStatesSignal.set(docStateMap);
    }

    public updateDocState(
        documentId: number,
        updater: (state: DocumentChunkingState) => DocumentChunkingState
    ): void {
        this.documentStatesSignal.update(map => {
            const state = map.get(documentId)!;
            map.set(documentId, updater(state));
            return new Map(map);
        });
    }

    public fetchChunks(naiveRagId: number, documentId: number): Observable<GetNaiveRagDocumentChunksResponse> {
        this.updateDocState(documentId, s => ({ ...s, status: 'fetching_chunks' }));

        return this.naiveRagService.getChunkPreview(naiveRagId, documentId).pipe(
            tap(({ chunks }) => {
                const state = this.documentStates().get(documentId);
                // document was updated during fetching
                if (state?.status === 'chunks_outdated') {
                    this.updateDocState(documentId, s => ({ ...s, chunks }));
                    return
                }

                this.updateDocState(documentId, s => ({ ...s, status: 'chunks_ready', chunks }));
            })
        );
    }
}
