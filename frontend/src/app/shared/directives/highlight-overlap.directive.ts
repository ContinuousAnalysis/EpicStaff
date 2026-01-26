import {Directive, ElementRef, Input, Renderer2} from "@angular/core";

@Directive({
    selector: '[highlightOverlap]'
})
export class HighlightOverlapDirective {
    @Input() set highlightOverlap(value: { text: string; overlap: number }) {
        this.render(value);
    }

    @Input() overlapColor: string = '#ffcf00';

    constructor(
        private el: ElementRef<HTMLElement>,
        private renderer: Renderer2
    ) {}

    private render({ text, overlap }: { text: string; overlap: number }) {
        if (!text) return;

        const splitIndex = Math.max(text.length - overlap, 0);

        const normalText = text.slice(0, splitIndex);
        const overlapText = text.slice(splitIndex);

        const textNode = this.renderer.createText(normalText);
        this.renderer.appendChild(this.el.nativeElement, textNode);

        if (overlapText) {
            const span = this.renderer.createElement('span');
            this.renderer.setStyle(span, 'color', this.overlapColor);
            const overlapNode = this.renderer.createText(overlapText);

            this.renderer.appendChild(span, overlapNode);
            this.renderer.appendChild(this.el.nativeElement, span);
        }
    }
}
