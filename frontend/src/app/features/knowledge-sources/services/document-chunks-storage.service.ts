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
                // document-config status 'chunked' does not represent is chunks are up-to-date
                case 'chunked':
                    status = 'new';
                    break;
                default:
                    status = 'chunking_failed';
            }

            docStateMap.set(doc.naive_rag_document_id, { id: doc.naive_rag_document_id, status: status, chunks: [] });
        });
        this.documentStatesSignal.set(docStateMap);
    }

    public updateDocsState(
        ragDocIds: number[],
        updater: (state: DocumentChunkingState) => DocumentChunkingState
    ): void {
        if (!ragDocIds.length) return;

        this.documentStatesSignal.update(prevMap => {
            const newMap = new Map(prevMap);

            for (const id of ragDocIds) {
                const prev = newMap.get(id);
                if (!prev) continue;

                const updated = updater(prev);
                newMap.set(id, updated);
            }

            return newMap;
        });
    }

    public removeDocsFromState(ragDocIds: number[]): void {
        if (!ragDocIds.length) return;

        this.documentStatesSignal.update(prevMap => {
            const newMap = new Map(prevMap);

            for (const id of ragDocIds) {
                newMap.delete(id);
            }

            return newMap;
        });
    }

    public markChunksOutdated(ragDocIds: number[]): void {
        this.updateDocsState(ragDocIds, s => ({
            ...s,
            status: s.status !== 'new' ? 'chunks_outdated' : s.status,
        }));
    }

    public fetchChunks(naiveRagId: number, documentId: number): Observable<GetNaiveRagDocumentChunksResponse> {
        this.updateDocsState([documentId], s => ({ ...s, status: 'fetching_chunks' }));

        return this.naiveRagService.getChunkPreview(naiveRagId, documentId).pipe(
            tap(({ chunks }) => {
                const state = this.documentStates().get(documentId);
                // document was updated during fetching
                if (state?.status === 'chunks_outdated') {
                    this.updateDocsState([documentId], s => ({ ...s, chunks }));
                    return
                }

                this.updateDocsState([documentId], s => ({ ...s, status: 'chunks_ready', chunks }));
            })
        );
    }
}
