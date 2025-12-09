import { Component } from '@angular/core';
import { IHeaderAngularComp } from 'ag-grid-angular';
import { IHeaderParams } from 'ag-grid-community';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-header-with-tooltip',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="header-container">
            <span class="header-text">{{ params.displayName }}</span>
            <span 
                *ngIf="tooltipText" 
                class="tooltip-icon"
                [title]="tooltipText"
            >
                <i class="ti ti-help-circle"></i>
            </span>
        </div>
    `,
    styles: [`
        .header-container {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 100%;
        }
        .header-text {
            font-weight: 500;
        }
        .tooltip-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            color: rgba(255, 255, 255, 0.6);
            background: rgba(255, 255, 255, 0.08);
            font-size: 0.75rem;
            cursor: help;
            transition: background 0.2s ease, color 0.2s ease;
        }
        .tooltip-icon:hover {
            color: #fff;
            background: rgba(104, 95, 255, 0.35);
        }
        .tooltip-icon i {
            font-size: 11px;
        }
    `]
})
export class HeaderWithTooltipComponent implements IHeaderAngularComp {
    public params!: IHeaderParams;
    public tooltipText: string = '';

    agInit(params: IHeaderParams): void {
        this.params = params;
        this.tooltipText = (params as any).tooltipText || '';
    }

    refresh(params: IHeaderParams): boolean {
        this.params = params;
        this.tooltipText = (params as any).tooltipText || '';
        return true;
    }
}

