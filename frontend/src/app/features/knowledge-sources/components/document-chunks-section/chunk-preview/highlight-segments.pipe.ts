import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface TextSegment {
    text: string;
    isMatch: boolean;
    matchIndex: number | null;
}

@Pipe({
    name: 'highlightSegments',
})
export class HighlightSegmentsPipe implements PipeTransform {
    constructor(private sanitizer: DomSanitizer) {}

    transform(segments: TextSegment[], activeMatchIndex: number): SafeHtml {
        const html = segments
            .map((seg) => {
                const escaped = this.escapeHtml(seg.text);
                if (!seg.isMatch) return escaped;

                const activeClass = seg.matchIndex === activeMatchIndex ? ' chunk__highlight--active' : '';
                return `<mark class="chunk__highlight${activeClass}" data-match-index="${seg.matchIndex}">${escaped}</mark>`;
            })
            .join('');

        return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
