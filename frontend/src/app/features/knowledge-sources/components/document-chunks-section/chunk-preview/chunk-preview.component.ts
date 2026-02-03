import { ChangeDetectionStrategy, Component, computed, input, OnChanges, signal, SimpleChanges } from "@angular/core";
import { NgClass } from "@angular/common";
import { SpinnerComponent } from "@shared/components";
import { DocumentChunkingState, NaiveRagDocumentChunk } from "../../../models/naive-rag-chunk.model";

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
        NgClass,
        SpinnerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChunkPreviewComponent implements OnChanges {
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

    isLoading = signal(false);
    hasMore = signal(true);

    ngOnChanges(changes: SimpleChanges) {
        console.log(changes);
    }

    onScroll(event: Event) {
        if (this.isLoading() || !this.hasMore()) return;
        if (!this.isNearBottom(event)) return;

        this.loadMore();
    }

    private isNearBottom(event: Event): boolean {
        const el = event.target as HTMLElement;
        const threshold = 500; //px

        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;

        return remaining <= threshold;
    }

    private loadMore() {
        // this.isLoading.set(true);
        // console.log('loading');
        //
        // setTimeout(() => {
        //     this.chunks.update((old) => {
        //         const [f, s, t] = old
        //         return [...old, f, s, t]
        //     })
        //     console.log('loaded')
        //     this.isLoading.set(false);
        // }, 1500)
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
}
