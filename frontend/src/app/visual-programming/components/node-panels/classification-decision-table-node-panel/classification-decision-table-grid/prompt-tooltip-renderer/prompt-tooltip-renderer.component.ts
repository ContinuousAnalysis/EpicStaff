import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    inject,
    OnDestroy,
    ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';
import { PromptConfig } from '../../../../../core/models/classification-decision-table.model';

interface PromptTooltipParams extends ICellRendererParams {
    prompts: Record<string, PromptConfig>;
    onPromptChange: (promptId: string, field: keyof PromptConfig, value: any) => void;
}

@Component({
    selector: 'app-prompt-tooltip-renderer',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
        <div
            class="prompt-id-cell"
            (mouseenter)="showTooltip($event)"
            (mouseleave)="scheduleHide()"
            (mousedown)="removeTooltipNow()"
        >
            <span *ngIf="!value" class="placeholder">—</span>
            <span *ngIf="value" class="prompt-id-text">{{ value }}</span>
            <i *ngIf="value && hasPrompt" class="ti ti-eye prompt-indicator"></i>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }
        .prompt-id-cell {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            padding: 0 8px;
            gap: 6px;
            cursor: default;
        }
        .prompt-id-text {
            color: #d4d4d4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 14px;
        }
        .prompt-indicator {
            color: rgba(104, 95, 255, 0.6);
            font-size: 14px;
            flex-shrink: 0;
        }
        .placeholder {
            color: rgba(255, 255, 255, 0.2);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class PromptTooltipRendererComponent implements ICellRendererAngularComp, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private elRef = inject(ElementRef);

    public value: string = '';
    public hasPrompt = false;

    private params!: PromptTooltipParams;
    private tooltipEl: HTMLElement | null = null;
    private hideTimeout: any = null;
    private promptConfig: PromptConfig | null = null;

    agInit(params: PromptTooltipParams): void {
        this.params = params;
        this.value = params.value || '';
        this.resolvePrompt();
    }

    refresh(params: PromptTooltipParams): boolean {
        this.params = params;
        const newValue = params.value || '';
        if (newValue !== this.value) {
            this.value = newValue;
            this.resolvePrompt();
            this.cdr.markForCheck();
        }
        return true;
    }

    ngOnDestroy(): void {
        this.removeTooltip();
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
    }

    private resolvePrompt(): void {
        const prompts = this.params.prompts || {};
        this.promptConfig = this.value ? prompts[this.value] || null : null;
        this.hasPrompt = !!this.promptConfig;
    }

    showTooltip(event: MouseEvent): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }

        if (!this.value || !this.hasPrompt) return;
        if (this.tooltipEl) return;

        this.resolvePrompt();
        if (!this.promptConfig) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'prompt-tooltip-popover';
        tooltip.innerHTML = this.buildTooltipHTML(this.promptConfig);

        tooltip.addEventListener('mouseenter', () => {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });
        tooltip.addEventListener('mouseleave', () => {
            this.scheduleHide();
        });
        tooltip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.removeTooltipNow();
            }
        });

        document.body.appendChild(tooltip);
        this.tooltipEl = tooltip;

        // Position relative to the cell
        const cellRect = this.elRef.nativeElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let left = cellRect.left;
        let top = cellRect.bottom + 4;

        // Keep within viewport
        if (left + tooltipRect.width > window.innerWidth - 16) {
            left = window.innerWidth - tooltipRect.width - 16;
        }
        if (top + tooltipRect.height > window.innerHeight - 16) {
            top = cellRect.top - tooltipRect.height - 4;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;

        this.attachListeners(tooltip);
    }

    scheduleHide(): void {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => {
            this.removeTooltip();
        }, 200);
    }

    removeTooltipNow(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        this.removeTooltip();
    }

    private removeTooltip(): void {
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }

    private buildTooltipHTML(config: PromptConfig): string {
        const promptText = this.escapeHtml(config.prompt_text || '');
        const schemaText = this.escapeHtml(
            typeof config.output_schema === 'string'
                ? config.output_schema
                : JSON.stringify(config.output_schema, null, 2) || ''
        );
        const resultVar = this.escapeHtml(config.result_variable || '');

        return `
            <div class="ptp-header">
                <span class="ptp-title">${this.escapeHtml(this.value)}</span>
                ${resultVar ? `<span class="ptp-badge">→ ${resultVar}</span>` : ''}
            </div>
            <div class="ptp-field">
                <label class="ptp-label">Prompt Text</label>
                <textarea class="ptp-textarea ptp-prompt-text" rows="6" spellcheck="false">${promptText}</textarea>
            </div>
            <div class="ptp-field">
                <label class="ptp-label">Output Schema</label>
                <textarea class="ptp-textarea ptp-output-schema" rows="4" spellcheck="false">${schemaText}</textarea>
            </div>
        `;
    }

    private attachListeners(tooltip: HTMLElement): void {
        const promptTextarea = tooltip.querySelector('.ptp-prompt-text') as HTMLTextAreaElement;
        const schemaTextarea = tooltip.querySelector('.ptp-output-schema') as HTMLTextAreaElement;

        if (promptTextarea) {
            promptTextarea.addEventListener('input', () => {
                this.params.onPromptChange?.(this.value, 'prompt_text', promptTextarea.value);
            });
            // Prevent ag-grid from capturing key events inside textarea
            promptTextarea.addEventListener('keydown', (e) => e.stopPropagation());
        }

        if (schemaTextarea) {
            schemaTextarea.addEventListener('input', () => {
                const val = schemaTextarea.value;
                try {
                    const parsed = JSON.parse(val);
                    this.params.onPromptChange?.(this.value, 'output_schema', parsed);
                } catch {
                    this.params.onPromptChange?.(this.value, 'output_schema', val);
                }
            });
            schemaTextarea.addEventListener('keydown', (e) => e.stopPropagation());
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
