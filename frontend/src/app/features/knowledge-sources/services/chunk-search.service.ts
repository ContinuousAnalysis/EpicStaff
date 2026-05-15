import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { ChunkSearchState, NaiveRagDocumentChunk } from '../models/naive-rag-chunk.model';
import { NaiveRagService } from './naive-rag.service';

@Injectable({
    providedIn: 'root',
})
export class ChunkSearchService {
    private readonly naiveRagService = inject(NaiveRagService);

    private defaultSearchState: ChunkSearchState = {
        mode: 'none',
        idFilter: 'all',
        textQuery: '',
        matchedChunkIds: [],
        totalMatches: 0,
        currentMatchIndex: 0,
        loading: false,
        searchedChunks: [],
        searchOffset: 0,
        searchHasMore: false,
    };

    private chunkSearchStateSignal = signal<ChunkSearchState>(this.defaultSearchState);
    public chunkSearchState = this.chunkSearchStateSignal.asReadonly();

    public clearSearch(): void {
        this.chunkSearchStateSignal.set(this.defaultSearchState);
    }

    public fetchSingleChunkById(
        naiveRagId: number,
        documentId: number,
        chunkId: number
    ): Observable<NaiveRagDocumentChunk | null> {
        this.chunkSearchStateSignal.update((s) => ({ ...s, loading: true }));

        const offset = chunkId - 1;

        return this.naiveRagService.getChunkPreview(naiveRagId, documentId, offset, 1).pipe(
            map(({ chunks }) => chunks[0] ?? null),
            tap((chunk) => {
                const state = this.chunkSearchStateSignal();
                let totalMatches = 0;
                let currentMatchIndex = 0;

                if (chunk && state.textQuery) {
                    totalMatches = this.countTextMatches(chunk.text, state.textQuery);
                    currentMatchIndex = totalMatches > 0 ? 1 : 0;
                }

                this.chunkSearchStateSignal.update((s) => ({
                    ...s,
                    loading: false,
                    searchedChunks: chunk ? [chunk] : [],
                    totalMatches,
                    currentMatchIndex,
                }));
            }),
            catchError((err) => {
                this.chunkSearchStateSignal.update((s) => ({ ...s, loading: false }));
                return throwError(() => err);
            })
        );
    }

    // count text matches on id-search mode
    private countTextMatches(text: string, query: string): number {
        if (!query) return 0;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = text.match(new RegExp(escaped, 'gi'));
        return matches ? matches.length : 0;
    }

    public searchChunksByText(naiveRagId: number, documentId: number, query: string): Observable<void> {
        this.chunkSearchStateSignal.update((s) => ({
            ...s,
            loading: true,
            textQuery: query,
            searchOffset: 0,
            searchHasMore: false,
            matchedChunkIds: [],
            searchedChunks: [],
        }));

        // get chunk ids that matched the search query
        return this.naiveRagService.searchChunks(naiveRagId, documentId, query).pipe(
            switchMap(({ preview_chunk_ids, total_matches, offset }) => {
                if (!preview_chunk_ids.length) {
                    this.chunkSearchStateSignal.update((s) => ({
                        ...s,
                        loading: false,
                        totalMatches: 0,
                        currentMatchIndex: 0,
                    }));
                    return of(undefined);
                }

                const nextOffset = offset + preview_chunk_ids.length;
                const hasMore = nextOffset < total_matches;

                this.chunkSearchStateSignal.update((s) => ({
                    ...s,
                    matchedChunkIds: preview_chunk_ids,
                    totalMatches: total_matches,
                    currentMatchIndex: 1,
                    searchOffset: nextOffset,
                    searchHasMore: hasMore,
                }));

                // fetch chunks by matched ids
                return this.naiveRagService.getChunksByIds(naiveRagId, documentId, preview_chunk_ids).pipe(
                    tap(({ chunks }) => {
                        const occurrences = chunks.reduce((sum, c) => sum + this.countTextMatches(c.text, query), 0);
                        this.chunkSearchStateSignal.update((s) => ({
                            ...s,
                            loading: false,
                            searchedChunks: chunks,
                            totalMatches: occurrences,
                        }));
                    }),
                    map(() => undefined)
                );
            }),
            catchError((err) => {
                this.chunkSearchStateSignal.update((s) => ({ ...s, loading: false }));
                return throwError(() => err);
            })
        );
    }

    public loadMoreSearchResults(naiveRagId: number, documentId: number): Observable<void> {
        const state = this.chunkSearchStateSignal();
        if (state.loading || !state.searchHasMore || state.mode !== 'text_only') {
            return of(undefined);
        }

        this.chunkSearchStateSignal.update((s) => ({ ...s, loading: true }));

        return this.naiveRagService.searchChunks(naiveRagId, documentId, state.textQuery, state.searchOffset).pipe(
            switchMap(({ preview_chunk_ids, total_matches, offset }) => {
                if (!preview_chunk_ids.length) {
                    this.chunkSearchStateSignal.update((s) => ({
                        ...s,
                        loading: false,
                        searchHasMore: false,
                    }));
                    return of(undefined);
                }

                const nextOffset = offset + preview_chunk_ids.length;
                const hasMore = nextOffset < total_matches;

                this.chunkSearchStateSignal.update((s) => ({
                    ...s,
                    matchedChunkIds: [...s.matchedChunkIds, ...preview_chunk_ids],
                    searchOffset: nextOffset,
                    searchHasMore: hasMore,
                }));

                return this.naiveRagService.getChunksByIds(naiveRagId, documentId, preview_chunk_ids).pipe(
                    tap(({ chunks }) => {
                        const newOccurrences = chunks.reduce(
                            (sum, c) => sum + this.countTextMatches(c.text, state.textQuery),
                            0
                        );
                        this.chunkSearchStateSignal.update((s) => ({
                            ...s,
                            loading: false,
                            searchedChunks: [...s.searchedChunks, ...chunks],
                            totalMatches: s.totalMatches + newOccurrences,
                        }));
                    }),
                    map(() => undefined)
                );
            }),
            catchError((err) => {
                this.chunkSearchStateSignal.update((s) => ({ ...s, loading: false }));
                return throwError(() => err);
            })
        );
    }

    public updateSearchParams(idFilter: number | 'all', textQuery: string): void {
        let mode: ChunkSearchState['mode'];
        if (idFilter !== 'all' && !textQuery) mode = 'id_only';
        else if (idFilter !== 'all' && textQuery) mode = 'id_and_text';
        else if (idFilter === 'all' && textQuery) mode = 'text_only';
        else mode = 'none';

        this.chunkSearchStateSignal.update((s) => ({ ...s, mode, idFilter, textQuery }));
    }

    public setCurrentMatchIndex(index: number): void {
        this.chunkSearchStateSignal.update((s) => ({ ...s, currentMatchIndex: index }));
    }
}
