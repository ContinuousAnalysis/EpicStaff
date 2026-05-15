import { Directive, inject, input, TemplateRef } from '@angular/core';

import { TableRow } from './table.model';

@Directive({
    selector: '[appTableCell]',
})
export class AppTableCellDirective {
    appTableCell = input.required<string>();
    readonly template = inject(TemplateRef<{ $implicit: TableRow; index: number }>);
}
