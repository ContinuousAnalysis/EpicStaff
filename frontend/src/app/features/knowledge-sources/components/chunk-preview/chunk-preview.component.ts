import {ChangeDetectionStrategy, Component, input, OnChanges, signal, SimpleChanges} from "@angular/core";
import {NgClass} from "@angular/common";
import {HighlightOverlapDirective} from "@shared/directives";
import {SpinnerComponent} from "@shared/components";

interface Chunk {
    id: number;
    text: string;
    overlap: number;
}

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
    documentId = input.required<number>();

    chunks = signal<Chunk[]>([
        {
            id: 1,
            text: 'The policeman on the beat moved up the avenue impressively. The impressiveness was habitual and not for show, for spectators were few. The time was barely 10 o\'clock at night, but chilly gusts of wind with a taste of rain in them had well nigh depeopled the streets.\n' +
                'Trying doors as he went, twirling his club with many intricate and artful movements, turning now and then to cast his watchful eye adown the pacific thoroughfare, the officer, with his stalwart form and slight swagger, made a fine picture of a guardian of the peace. The vicinity was one that kept early hours. Now and then you might see the lights of a cigar store or of an all-night lunch counter; but the majority of the doors belonged to business places that had long since been closed.\n' +
                'When about midway of a certain block the policeman suddenly slowed his walk. In the doorway of a darkened hardware store a man leaned, with an unlighted cigar in his mouth. As the policeman walked up to him the man spoke up quickly.',
            overlap: 200
        },
        {
            id: 2,
            text: 'About that long ago there used to be a restaurant where this store stands-- \'Big Joe\' Brady\'s restaurant."\n' +
                '"Until five years ago," said the policeman. "It was torn down then."\n' +
                'The man in the doorway struck a match and lit his cigar. The light showed a pale, square-jawed face with keen eyes, and a little white scar near his right eyebrow. His scarfpin was a large diamond, oddly set.\n' +
                '"Twenty years ago to-night," said the man, "I dined here at \'Big Joe\' Brady\'s with Jimmy Wells, my best chum, and the finest chap in the world. He and I were raised here in New York, just like two brothers, together. I was eighteen and Jimmy was twenty. The next morning I was to start for the West to make my fortune. You couldn\'t have dragged Jimmy out of New York; he thought it was the only place on earth. Well, we agreed that night that we would meet here again exactly twenty years from that date and time, no matter what our conditions might be or from what distance we might have to come. ',
            overlap: 200
        },
        {
            id: 3,
            text: '"Rather a long time between meets, though, it seems to me. Haven\'t you heard from your friend since you left?"\n' +
                '"Well, yes, for a time we corresponded," said the other. "But after a year or two we lost track of each other. You see, the West is a pretty big proposition, and I kept hustling around over it pretty lively. But I know Jimmy will meet me here if he\'s alive, for he always was the truest, stanchest old chap in the world. He\'ll never forget. I came a thousand miles to stand in this door to-night, and it\'s worth it if my old partner turns up."\n' +
                ' The waiting man pulled out a handsome watch, the lids of it set with small diamonds.\n' +
                '"Three minutes to ten," he announced. "It was exactly ten o\'clock when we parted here at the restaurant door."\n' +
                '"Did pretty well out West, didn\'t you?" asked the policeman.\n' +
                '"You bet! I hope Jimmy has done half as well. He was a kind of plodder, though, good fellow as he was. I\'ve had to compete with some of the sharpest wits going to get my pile.',
            overlap: 200
        }
    ]);
    blurredChunk: Chunk = {
        id: 0,
        text: 'The policeman on the beat moved up the avenue impressively. The impressiveness was habitual and not for show, for spectators were few. The time was barely 10 o\'clock at night, but chilly gusts of wind with a taste of rain in them had well nigh depeopled the streets.\n' +
            'Trying doors as he went, twirling his club with many intricate and artful movements, turning now and then to cast his watchful eye adown the pacific thoroughfare, the officer, with his stalwart form and slight swagger, made a fine picture of a guardian of the peace. ',
          overlap: 200
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
        this.isLoading.set(true);
        console.log('loading');

        setTimeout(() => {
            this.chunks.update((old) => {
                const [f, s, t] = old
                return [...old, f, s, t]
            })
            console.log('loaded')
            this.isLoading.set(false);
        }, 1500)
    }
}
