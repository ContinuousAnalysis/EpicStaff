import { Component, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-manipulation-renderer',
    standalone: true,
    imports: [CommonModule],
    template: `<div class="manipulation-renderer" [innerHTML]="highlightedValue"></div>`,
    styleUrls: ['./manipulation-renderer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManipulationRendererComponent implements ICellRendererAngularComp {
    public highlightedValue: string = '';

    agInit(params: ICellRendererParams): void {
        this.updateValue(params.value);
    }

    refresh(params: ICellRendererParams): boolean {
        this.updateValue(params.value);
        return true;
    }

    private updateValue(value: string): void {
        if (!value) {
            this.highlightedValue = '';
            return;
        }

        // Escape HTML
        let escaped = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Highlight variables (state.x.y)
        escaped = escaped.replace(/(@?state(?:\.[\w$]+)+)\b/g, '<span class="variable">$1</span>');

        // Highlight parentheses
        escaped = escaped.replace(/([()])/g, '<span class="paren">$1</span>');

        // Handle newlines
        escaped = escaped.replace(/\n/g, '<br>');

        this.highlightedValue = escaped;
    }
}

