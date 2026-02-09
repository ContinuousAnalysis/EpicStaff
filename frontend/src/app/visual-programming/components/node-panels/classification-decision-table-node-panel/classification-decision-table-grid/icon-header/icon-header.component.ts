import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IHeaderAngularComp } from 'ag-grid-angular';
import { IHeaderParams } from 'ag-grid-community';

@Component({
    selector: 'app-icon-header',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="icon-header" [title]="tooltip">
            <i [class]="iconClass"></i>
        </div>
    `,
    styles: [`
        .icon-header {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            cursor: default;
        }
        .icon-header i {
            font-size: 1.1rem;
            color: rgba(255, 255, 255, 0.7);
        }
    `],
})
export class IconHeaderComponent implements IHeaderAngularComp {
    public iconClass = '';
    public tooltip = '';

    agInit(params: IHeaderParams & { iconClass?: string; tooltip?: string }): void {
        this.iconClass = params.iconClass || '';
        this.tooltip = params.tooltip || '';
    }

    refresh(params: IHeaderParams): boolean {
        return true;
    }
}
