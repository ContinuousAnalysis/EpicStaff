import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

import { PromptConfig } from '../../../../../core/models/classification-decision-table.model';

interface LlmOption {
    id: number;
    label: string;
}

interface PromptTooltipParams extends ICellRendererParams {
    prompts: Record<string, PromptConfig>;
    llmConfigs: LlmOption[];
    onPromptChange: (promptId: string, field: keyof PromptConfig, value: PromptConfig[keyof PromptConfig]) => void;
    onOpenInPromptLibrary: (promptId: string) => void;
}

@Component({
    selector: 'app-prompt-tooltip-renderer',
    imports: [CommonModule],
    template: `
        <div class="prompt-id-cell">
            <span
                *ngIf="!value()"
                class="placeholder select-placeholder"
            >
                Select prompt <i class="ti ti-chevron-down"></i>
            </span>
            <ng-container *ngIf="value()">
                <span
                    *ngIf="isDeleted()"
                    class="deleted-prompt-badge"
                >
                    <i class="ti ti-alert-triangle"></i> Deleted
                </span>
                <ng-container *ngIf="!isDeleted()">
                    <div class="prompt-chip">
                        <span class="chip-id">{{ value() }}</span>
                    </div>
                    <button
                        class="open-in-library-btn"
                        title="Open in Prompt Library"
                        (click)="onOpenLibrary($event)"
                    >
                        <i class="ti ti-arrow-up-right"></i>
                    </button>
                </ng-container>
            </ng-container>
        </div>
    `,
    styles: [
        `
            :host {
                display: block;
                width: 100%;
                height: 100%;
                position: absolute;
            }
            .prompt-id-cell {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                padding: 0 8px;
                gap: 6px;
                cursor: default;
                overflow: hidden;
            }
            .prompt-chip {
                display: flex;
                align-items: center;
                gap: 4px;
                flex: 1;
                min-width: 0;
                overflow: hidden;
            }
            .chip-id {
                color: #d9d9de;
                font-size: 14px;
                font-family: Inter, sans-serif;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex-shrink: 1;
            }
            .chip-var {
                font-size: 10px;
                color: rgba(217, 217, 222, 0.6);
                font-family: Inter, sans-serif;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .chip-llm {
                font-size: 14px;
                color: rgba(217, 217, 222, 0.6);
                font-family: Inter, sans-serif;
                white-space: nowrap;
                flex-shrink: 0;
                margin-left: auto;
            }
            .open-in-library-btn {
                display: none;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
                flex-shrink: 0;
                background: transparent;
                border: 1px solid #685fff;
                border-radius: 4px;
                box-shadow: none;
                cursor: pointer;
                padding: 0;
                color: #685fff;
                font-size: 16px;
            }
            .open-in-library-btn:hover {
                background: rgba(104, 95, 255, 0.08);
            }
            .prompt-id-cell:hover .open-in-library-btn {
                display: flex;
            }
            .select-placeholder {
                display: flex;
                align-items: center;
                gap: 4px;
                color: rgba(255, 255, 255, 0.35);
                font-size: 13px;
            }
            .select-placeholder .ti {
                font-size: 11px;
                opacity: 0.7;
            }
            .deleted-prompt-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                background: rgba(255, 59, 48, 0.15);
                color: var(--error-color, #ff3b30);
                border: 1px solid rgba(255, 59, 48, 0.35);
                border-radius: 10px;
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
            }
            .deleted-prompt-badge .ti {
                font-size: 12px;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class PromptTooltipRendererComponent implements ICellRendererAngularComp {
    readonly value = signal<string>('');
    readonly isDeleted = signal(false);
    readonly resultVariable = signal<string>('');
    readonly llmLabel = signal<string>('Default LLM');

    private params!: PromptTooltipParams;

    agInit(params: PromptTooltipParams): void {
        this.params = params;
        this.applyParams(params);
    }

    refresh(params: PromptTooltipParams): boolean {
        this.params = params;
        this.applyParams(params);
        return true;
    }

    private applyParams(params: PromptTooltipParams): void {
        const val = params.value || '';
        this.value.set(val);

        const prompts = params.prompts || {};
        const promptConfig = val ? prompts[val] || null : null;
        this.isDeleted.set(!!val && !promptConfig);

        if (promptConfig) {
            this.resultVariable.set(promptConfig.result_variable || '');
            const llmConfigs = params.llmConfigs || [];
            const llmId = promptConfig.llm_config;
            if (llmId != null) {
                const found = llmConfigs.find((l) => l.id === llmId);
                this.llmLabel.set(found ? found.label : 'Default LLM');
            } else {
                this.llmLabel.set('Default LLM');
            }
        } else {
            this.resultVariable.set('');
            this.llmLabel.set('Default LLM');
        }
    }

    onOpenLibrary(event: MouseEvent): void {
        event.stopPropagation();
        const promptId = this.value();
        if (promptId) {
            this.params.onOpenInPromptLibrary?.(promptId);
        }
    }
}
