import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from "@angular/cdk/scrolling";
import { NgClass } from "@angular/common";
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    computed, DestroyRef, inject,
    input, OnChanges, QueryList, SimpleChanges,
    ViewChild, ViewChildren, ElementRef
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { SpinnerComponent } from "@shared/components";
import { MATERIAL_FORMS } from "@shared/material-forms";
import { calcLimit } from "../../../helpers/calculate-chunks-fetch-limit.util";
import {
    DocumentChunkingState,
    NaiveRagDocumentChunk
} from "../../../models/naive-rag-chunk.model";
import { NaiveRagDocumentsStorageService } from "../../../services/naive-rag-documents-storage.service";

interface DisplayedChunk {
    chunkIndex: number,
    overlap: string,
    text: string
}

@Component({
    selector: 'app-chunk-preview',
    templateUrl: './chunk-preview.component.html',
    styleUrls: ['./chunk-preview.component.scss'],
    imports: [
        SpinnerComponent,
        CdkVirtualScrollViewport,
        CdkFixedSizeVirtualScroll,
        CdkVirtualForOf,
        NgClass,
        FormsModule,
        MATERIAL_FORMS,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChunkPreviewComponent implements OnChanges, AfterViewInit {
    ragId = input.required<number>();
    docId = input.required<number>();
    chunkingState = input.required<DocumentChunkingState>();
    blurredChunk: NaiveRagDocumentChunk = {
        preview_chunk_id: 0,
        text: 'The policeman on the beat moved up the avenue impressively. The impressiveness was habitual and not for show, for spectators were few. The time was barely 10 o\'clock at night, but chilly gusts of wind with a taste of rain in them had well nigh depeopled the streets.\n' +
            'Trying doors as he went, twirling his club with many intricate and artful movements, turning now and then to cast his watchful eye adown the pacific thoroughfare, the officer, with his stalwart form and slight swagger, made a fine picture of a guardian of the peace. ',
        chunk_index: 0,
        token_count: null,
        metadata: {},
        overlap_start_index: null,
        overlap_end_index: null,
        created_at: ''
    };

    @ViewChild('viewport') viewport!: CdkVirtualScrollViewport;
    @ViewChildren('textContainers') textContainers!: QueryList<ElementRef<HTMLParagraphElement>>;

    private documentStorageService = inject(NaiveRagDocumentsStorageService);
    private destroyRef = inject(DestroyRef);

    itemSize = 100;
    private limit: number = 0;
    private totalChunks: number = 0;
    private bufferLimit: number = 50;
    private nextOffset: number = 0;
    private prevOffset: number = 0;
    private loading: boolean = false;
    private anchorChunkIndex: number | null = null;

    chunks = computed<DisplayedChunk[]>(() => {
        const state = this.chunkingState();

        if (state.chunkStrategy !== 'token') {
            return this.calculateChunks(
                state.chunks,
                () => state.chunkOverlap,
                () => state.chunkOverlap
            );
        } else {
            return this.calculateChunks(
                state.chunks,
                (chunk) => chunk.overlap_start_index ?? 0,
                (chunk) => chunk.overlap_end_index ?? 0
            );
        }
    });

    ngOnChanges(changes: SimpleChanges) {
        const state: DocumentChunkingState = this.chunkingState();
        const limit = calcLimit(state.chunkSize);

        this.limit = limit;
        this.totalChunks = state.total;
        this.bufferLimit = limit * 3;

        const firstChunkId = state.chunks[0].chunk_index;
        const lastChunkId = state.chunks[state.chunks.length - 1].chunk_index;

        this.prevOffset = Math.max(firstChunkId - limit - 1, 0);
        this.nextOffset = lastChunkId;
    }

    ngAfterViewInit() {
        setTimeout(() => {
            const elementRefs = this.textContainers.toArray();
            if (!elementRefs.length) return;

            const totalHeight = elementRefs.reduce((sum, el) => sum + el.nativeElement.offsetHeight, 0);

            this.itemSize = totalHeight / elementRefs.length;
        })
    }

    onScroll(index: number) {
        const threshold = Math.max(Math.floor(this.limit * 0.2), 5);

        if (index > this.chunks().length - threshold) {
            this.loadMoreDown(index);
        }

        if (index < threshold && this.prevOffset >= 0) {
            this.loadMoreUp(index);
        }
    }

    private loadMoreDown(anchorIndex: number) {
        if (this.loading || this.nextOffset >= this.totalChunks) return;
        this.loading = true;
        this.anchorChunkIndex = anchorIndex;

        this.documentStorageService.loadNextChunks(
            this.ragId(),
            this.docId(),
            this.nextOffset,
            this.limit,
            this.bufferLimit
        )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ removedCount, fetchedCount }) => {
                if (removedCount > 0 && this.anchorChunkIndex !== null) {
                    this.viewport.scrollToIndex(this.anchorChunkIndex - fetchedCount);
                }
                this.anchorChunkIndex = null;
                this.loading = false;
            });
    }

    private loadMoreUp(anchorIndex: number) {
        const firstId = this.chunks()[0].chunkIndex;

        if (this.loading || this.prevOffset < 0 || firstId <= 1) return;
        this.loading = true;
        this.anchorChunkIndex = anchorIndex;

        this.documentStorageService.loadPrevChunks(
            this.ragId(),
            this.docId(),
            this.prevOffset,
            this.limit,
            this.bufferLimit
        )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ removedCount, fetchedCount }) => {
                if (removedCount > 0 && this.anchorChunkIndex !== null) {
                    this.viewport.scrollToIndex(this.anchorChunkIndex + fetchedCount);
                }
                this.anchorChunkIndex = null;
                this.loading = false;
            });
    }

    private calculateChunks(
        chunks: NaiveRagDocumentChunk[],
        getStart: (chunk: NaiveRagDocumentChunk) => number,
        getEnd: (chunk: NaiveRagDocumentChunk) => number
    ): DisplayedChunk[] {
        return chunks.map((chunk, index, arr) => {
            const isFirst = index === 0;
            const isLast = index === arr.length - 1;

            const start = getStart(chunk) ?? 0;
            const end = getEnd(chunk) ?? 0;

            const overlap = isFirst ? '' : chunk.text.slice(0, start);

            let text: string;
            if (isFirst) {
                text = end ? chunk.text.slice(0, -end) : chunk.text;
            } else if (isLast) {
                text = chunk.text.slice(start);
            } else {
                text = end ? chunk.text.slice(start, -end) : chunk.text.slice(start);
            }

            return {
                chunkIndex: chunk.chunk_index,
                overlap,
                text,
            };
        });
    }

    trackByFn(index: number, chunk: DisplayedChunk) {
        return chunk.chunkIndex;
    }
}
