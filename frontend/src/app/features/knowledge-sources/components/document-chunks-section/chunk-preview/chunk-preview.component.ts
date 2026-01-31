import { ChangeDetectionStrategy, Component, input, OnChanges, signal, SimpleChanges } from "@angular/core";
import { NgClass } from "@angular/common";
import { HighlightOverlapDirective } from "@shared/directives";
import { SpinnerComponent } from "@shared/components";
import { NaiveRagDocumentChunk } from "../../../models/naive-rag-chunk.model";

@Component({
    selector: 'app-chunk-preview',
    templateUrl: './chunk-preview.component.html',
    styleUrls: ['./chunk-preview.component.scss'],
    imports: [
        NgClass,
        HighlightOverlapDirective,
        SpinnerComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChunkPreviewComponent implements OnChanges {
    chunks = input.required<NaiveRagDocumentChunk[]>();
    blurredChunk: NaiveRagDocumentChunk = {
        preview_chunk_id: 0,
        text: 'The policeman on the beat moved up the avenue impressively. The impressiveness was habitual and not for show, for spectators were few. The time was barely 10 o\'clock at night, but chilly gusts of wind with a taste of rain in them had well nigh depeopled the streets.\n' +
            'Trying doors as he went, twirling his club with many intricate and artful movements, turning now and then to cast his watchful eye adown the pacific thoroughfare, the officer, with his stalwart form and slight swagger, made a fine picture of a guardian of the peace. ',
        chunk_index: 0,
        token_count: null,
        metadata: {},
        created_at: ''
    };

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
}
