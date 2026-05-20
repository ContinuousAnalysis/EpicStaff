import { Directive, ElementRef, HostListener, inject } from '@angular/core';

import { MultiSelectComponent } from './multi-select.component';

@Directive({
    selector: '[appMultiSelectTrigger]',
})
export class MultiSelectTriggerDirective {
    readonly elementRef = inject(ElementRef<HTMLElement>);
    private readonly multiSelect = inject(MultiSelectComponent, { host: true });

    @HostListener('click')
    onClick(): void {
        this.multiSelect.toggle();
    }
}
