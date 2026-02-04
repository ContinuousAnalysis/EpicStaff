import { HttpErrorResponse } from "@angular/common/http";
import { inject, Injectable, signal } from "@angular/core";
import { EMPTY, filter, Observable, throwError } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import {
    DocFieldChange, TableDocument,
} from "../components/rag-configuration/configuration-table/configuration-table.interface";
import { calcLimit } from "../helpers/calculate-chunks-fetch-limit.util";
import { normalizeBulkUpdateErrors } from "../helpers/normalize-bulk-update-errors.util";
import { transformToTableDocuments } from "../helpers/transform-to-table-document.util";
import {
    DocumentChunkingState,
    DocumentWithChunksStatus,
    GetNaiveRagDocumentChunksResponse, NaiveRagChunkingResponse
} from "../models/naive-rag-chunk.model";
import {
    BulkDeleteNaiveRagDocumentDtoResponse,
    BulkUpdateNaiveRagDocumentDtoResponse,
    UpdateNaiveRagDocumentDtoRequest,
    UpdateNaiveRagDocumentResponse
} from "../models/naive-rag-document.model";
import { NaiveRagService } from "./naive-rag.service";

@Injectable({
    providedIn: 'root'
})
export class NaiveRagDocumentsStorageService {
    private documentsSignal = signal<TableDocument[]>([]);
    public documents = this.documentsSignal.asReadonly();

    private documentStatesSignal = signal<Map<number, DocumentChunkingState>>(new Map());
    public documentStates = this.documentStatesSignal.asReadonly();

    private readonly naiveRagService = inject(NaiveRagService);

    public fetchDocumentConfigs(naiveRagId: number): Observable<TableDocument[]> {
        return this.naiveRagService.getDocumentConfigs(naiveRagId)
            .pipe(
                map(({ configs }) => transformToTableDocuments(configs)),
                tap(documents => this.initDocumentStatesMap(documents)),
                tap(documents => this.documentsSignal.set(documents)),
                catchError((err) => throwError(() => err)),
            );
    }

    public fetchChunks(
        naiveRagId: number,
        documentId: number,
    ): Observable<GetNaiveRagDocumentChunksResponse> {
        this.updateDocsState([documentId], s => ({ ...s, status: 'fetching_chunks' }));

        const docChunkSize = this.documentsSignal().find(d => d.naive_rag_document_id === documentId)?.chunk_size;
        const limit = docChunkSize ? calcLimit(docChunkSize) : 50;

        return this.naiveRagService.getChunkPreview(naiveRagId, documentId, 0, limit).pipe(
            tap(({ chunks, total_chunks }) => {
                const state = this.documentStates().get(documentId);
                // document was updated during fetching
                if (state?.status === 'chunks_outdated') return;

                const docData = this.documents().find(d => d.naive_rag_document_id === documentId);
                if (!docData) return;

                this.updateDocsState([documentId], s => ({
                    ...s,
                    status: 'chunks_ready',
                    chunkStrategy: docData.chunk_strategy,
                    chunkOverlap: docData.chunk_overlap,
                    total: total_chunks,
                    chunks
                }));
            }),
            catchError((err) => throwError(() => err))
        );
    }

    public loadNextChunks(
        naiveRagId: number,
        documentId: number,
        offset: number,
        limit: number,
        bufferLimit: number
    ): Observable<{removedCount: number, fetchedCount: number}> {
        return this.naiveRagService.getChunkPreview(naiveRagId, documentId, offset, limit).pipe(
            map(({ chunks }) => {
                let removedCount: number = 0;
                this.updateDocsState([documentId], s => {
                    let updatedChunks = [...s.chunks, ...chunks];
                    if (updatedChunks.length > bufferLimit) {
                        removedCount = updatedChunks.length - bufferLimit;
                        updatedChunks.splice(0, removedCount);
                    }
                    return { ...s, removedCount, chunks: updatedChunks };
                });
                return { removedCount, fetchedCount: chunks.length };
            }),
            catchError((err) => throwError(() => err))
        );
    }

    public loadPrevChunks(
        naiveRagId: number,
        documentId: number,
        offset: number,
        limit: number,
        bufferLimit: number
    ): Observable<{removedCount: number, fetchedCount: number}> {
        return this.naiveRagService.getChunkPreview(naiveRagId, documentId, offset, limit)
            .pipe(
                map(({ chunks }) => {
                    let removedCount: number = 0;
                    this.updateDocsState([documentId], s => {
                        let updatedChunks = [...chunks, ...s.chunks];
                        if (updatedChunks.length > bufferLimit) {
                            removedCount = updatedChunks.length - bufferLimit;
                            updatedChunks.splice(updatedChunks.length - removedCount, removedCount);
                        }
                        return { ...s, removedCount, chunks: updatedChunks };
                    });
                    return { removedCount, fetchedCount: chunks.length };
                })
            );
    }

    public initDocumentStatesMap(documents: TableDocument[]): void {
        const docStateMap = new Map<number, DocumentChunkingState>();
        documents.forEach(doc => {
            let status: DocumentWithChunksStatus;

            switch (doc.status) {
                case 'new':
                    status = 'new';
                    break;
                case 'chunking':
                    status = 'chunking';
                    break;
                // document-config status 'chunked' does not represent is chunks are up-to-date
                case 'chunked':
                    status = 'new';
                    break;
                case 'completed':
                    status = 'new';
                    break;
                default:
                    status = 'chunking_failed';
            }

            docStateMap.set(doc.naive_rag_document_id, {
                id: doc.naive_rag_document_id,
                status: status,
                chunkOverlap: doc.chunk_overlap,
                chunkSize: doc.chunk_size,
                chunkStrategy: doc.chunk_strategy,
                total: 0,
                removedCount: 0,
                chunks: [],
            });
        });
        this.documentStatesSignal.set(docStateMap);
    }

    runChunking(ragId: number, documentId: number): Observable<NaiveRagChunkingResponse> {
        const initialState = this.documentStates().get(documentId);
        if (!initialState) return EMPTY;

        this.updateDocsState([documentId], s => ({ ...s, status: 'chunking' }));

        return this.naiveRagService.runChunkingProcess(ragId, documentId).pipe(
            // TODO: handle chunking errors
            filter(r => r.status === 'completed'),

            tap(() => {
                const state = this.documentStates().get(documentId);
                if (state?.status === 'chunks_outdated') return;

                this.updateDocsState([documentId], s => ({ ...s, status: 'chunked' }));
            })
        )
    }

    public updateDocumentField(naiveRagId: number, change: DocFieldChange): Observable<UpdateNaiveRagDocumentResponse> {
        const { documentId, field, value } = change;
        if (value === null) return EMPTY;

        return this.naiveRagService.updateDocumentConfigById(
            naiveRagId,
            documentId,
            { [field]: value }
        ).pipe(
            tap(response => this.handleUpdateSuccess(response)),
            catchError(err => {
                this.handleUpdateError(err, field, documentId)
                return throwError(() => err)
            })
        );
    }

    public toggleAll(all: boolean) {
        this.documentsSignal.update(items => items.map(i => ({ ...i, checked: !all })));
    }

    public toggleDocument(id: number) {
        this.documentsSignal.update(items => items.map(i => {
            return i.naive_rag_document_id === id ? { ...i, checked: !i.checked } : i
        }));
    }

    public bulkEditDocConfigs(
        ragId: number,
        config_ids: number[],
        dto: UpdateNaiveRagDocumentDtoRequest
    ): Observable<BulkUpdateNaiveRagDocumentDtoResponse> {
        if (!config_ids.length) return EMPTY;

        return this.naiveRagService.bulkUpdateDocumentConfigs(
            ragId,
            { config_ids, ...dto }
        ).pipe(
            tap((response) => this.hangleBulkEdit(response)),
            catchError(err => throwError(() => err))
        );
    }

    public bulkDeleteDocConfigs(
        ragId: number,
        config_ids: number[]
    ): Observable<BulkDeleteNaiveRagDocumentDtoResponse> {
        if (!config_ids.length) return EMPTY;

        return this.naiveRagService
            .bulkDeleteDocumentConfigs(ragId, { config_ids })
            .pipe(
                tap(response => this.handleSuccessBulkDelete(response)),
                catchError(err => throwError(() => err)),
            );
    }

    private updateDocsState(
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

    private removeDocsFromState(ragDocIds: number[]): void {
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

    // handlers
    private handleUpdateSuccess(response: UpdateNaiveRagDocumentResponse) {
        const { config } = response;

        this.documentsSignal.update(items =>
            items.map(i =>
                i.document_id === config.document_id ? { ...i, ...config, errors: {} } : i
            )
        );
        this.markChunksOutdated([config.naive_rag_document_id]);
    }

    private handleUpdateError(
        error: HttpErrorResponse,
        field: keyof TableDocument,
        documentId: number
    ) {
        const errorMessage = error.error.error;

        this.documentsSignal.update(items =>
            items.map(item => {
                return item.naive_rag_document_id === documentId ? {
                    ...item,
                    errors: { [field]: { reason: errorMessage } }
                } : item;
            })
        );
    }

    private hangleBulkEdit(res: BulkUpdateNaiveRagDocumentDtoResponse) {
        const configMap = new Map(
            res.configs.map(c => [c.naive_rag_document_id, c])
        );

        this.documentsSignal.update(items =>
            items.map(item => {
                const updated = configMap.get(item.naive_rag_document_id);
                if (!updated) return item;

                return {
                    ...item,
                    ...updated,
                    errors: normalizeBulkUpdateErrors(updated.errors)
                };
            })
        );
        this.markChunksOutdated(Array.from(configMap.keys()));
    }

    private handleSuccessBulkDelete(res: BulkDeleteNaiveRagDocumentDtoResponse) {
        const deletedIds = res.deleted_config_ids;
        this.documentsSignal.update(items => items.filter(i => {
            return !deletedIds.includes(i.naive_rag_document_id);
        }));
        this.removeDocsFromState(deletedIds);
    }
}
