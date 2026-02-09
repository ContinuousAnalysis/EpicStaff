import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    ViewChild,
    AfterViewInit,
    OnDestroy,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

// Shared singleton Monaco loader — ensures Monaco is loaded exactly once
let monacoLoadPromise: Promise<void> | null = null;

function ensureMonacoLoaded(): Promise<void> {
    if ((window as any).monaco?.editor?.colorize) {
        return Promise.resolve();
    }
    if (monacoLoadPromise) {
        return monacoLoadPromise;
    }
    monacoLoadPromise = new Promise<void>((resolve) => {
        const win = window as any;
        // If the AMD loader is already present (ngx-monaco-editor loaded it)
        if (win.require?.config) {
            win.require.config({ paths: { vs: 'assets/monaco/min/vs' } });
            win.require(['vs/editor/editor.main'], () => resolve());
            return;
        }
        // Otherwise, load the AMD loader script first
        const script = document.createElement('script');
        script.src = 'assets/monaco/min/vs/loader.js';
        script.onload = () => {
            win.require.config({ paths: { vs: 'assets/monaco/min/vs' } });
            win.require(['vs/editor/editor.main'], () => resolve());
        };
        script.onerror = () => {
            monacoLoadPromise = null; // allow retry
            resolve(); // resolve anyway so cells fall back to plain text
        };
        document.head.appendChild(script);
    });
    return monacoLoadPromise;
}

@Component({
    selector: 'app-monaco-cell-renderer',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="code-cell"
            #codeContainer
            (mouseenter)="onMouseEnter($event)"
            (mouseleave)="scheduleHide()"
            (click)="onCellClick($event)"
        >
            <span *ngIf="!value" class="placeholder">—</span>
            <span *ngIf="value && !colorized" class="plain-text">{{ displayText }}</span>
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
        }
        .code-cell {
            width: 100%;
            height: 100%;
            overflow: hidden;
            display: flex;
            align-items: center;
            padding: 0 8px;
            cursor: text;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            color: #d4d4d4;
        }
        .plain-text {
            color: #d4d4d4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .placeholder {
            color: rgba(255, 255, 255, 0.2);
        }
        .colorized-code {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: inline;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class MonacoCellRendererComponent implements ICellRendererAngularComp, AfterViewInit, OnDestroy {
    @ViewChild('codeContainer', { static: true }) codeContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);
    private elRef = inject(ElementRef);

    public value: string = '';
    public displayText: string = '';
    public colorized = false;
    private destroyed = false;
    private params!: ICellRendererParams;
    private tooltipEl: HTMLElement | null = null;
    private hideTimeout: any = null;
    private editorInstance: any = null;
    private singleLine = false;
    private pendingValue: string | null = null;
    private readonlyTooltip = false;

    agInit(params: ICellRendererParams): void {
        this.params = params;
        this.value = params.value || '';
        this.singleLine = (params as any).singleLine === true;
        this.updateDisplayText();
    }

    refresh(params: ICellRendererParams): boolean {
        this.params = params;
        const newValue = params.value || '';
        if (newValue !== this.value) {
            this.value = newValue;
            this.colorized = false;
            this.updateDisplayText();
            this.tryColorize();
            this.cdr.markForCheck();
        }
        return true;
    }

    ngAfterViewInit(): void {
        this.tryColorize();
    }

    ngOnDestroy(): void {
        this.destroyed = true;
        this.removeTooltip();
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
    }

    onMouseEnter(event: MouseEvent): void {
        if (!this.singleLine && this.value) {
            this.showTooltip(event);
        }
    }

    onCellClick(event: MouseEvent): void {
        if (this.singleLine || !this.value) {
            this.showTooltip(event);
        }
    }

    private isCellMerged(): boolean {
        const agCell = this.elRef.nativeElement.closest('.ag-cell');
        if (!agCell) return false;
        const rowSpan = parseInt(agCell.getAttribute('rowspan') || '1', 10);
        return rowSpan > 1;
    }

    showTooltip(event: MouseEvent): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        if (this.tooltipEl) return;

        const monaco = (window as any).monaco;
        if (!monaco?.editor?.create) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'code-tooltip-popover';

        const editorContainer = document.createElement('div');
        editorContainer.className = 'ctp-editor-container';
        tooltip.appendChild(editorContainer);

        tooltip.addEventListener('mouseenter', () => {
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
        });
        tooltip.addEventListener('mouseleave', () => this.scheduleHide());

        document.body.appendChild(tooltip);
        this.tooltipEl = tooltip;

        // Measure actual text position inside the cell
        const agCell = this.elRef.nativeElement.closest('.ag-cell');
        const cellRect = agCell ? agCell.getBoundingClientRect() : this.codeContainer.nativeElement.getBoundingClientRect();
        const codeCellRect = this.codeContainer.nativeElement.getBoundingClientRect();

        // Text element inside .code-cell (span.plain-text, span.colorized-code, or span.placeholder)
        const textEl = this.codeContainer.nativeElement.querySelector('span');
        const textRect = textEl ? textEl.getBoundingClientRect() : codeCellRect;

        // Compute offsets from .ag-cell edge to actual text start
        const leftOffset = textRect.left - cellRect.left;
        const topOffset = textRect.top - cellRect.top;

        const monacoLineHeight = 19;

        let editorWidth: number;
        let editorHeight: number;

        const gridEl = this.elRef.nativeElement.closest('.decision-table-grid-container');
        const maxWidth = gridEl ? gridEl.getBoundingClientRect().right - cellRect.left : 800;
        const charWidth = 7.2;
        const lines = (this.value || '').split('\n');
        const longestLine = Math.max(...lines.map(l => l.length), 20);
        const contentWidth = longestLine * charWidth + leftOffset + 20;

        if (this.singleLine) {
            editorWidth = Math.min(Math.max(contentWidth, cellRect.width), maxWidth);
            editorHeight = cellRect.height;
        } else {
            editorWidth = Math.min(Math.max(contentWidth, cellRect.width), maxWidth);
            editorHeight = Math.min(
                Math.max(lines.length * monacoLineHeight + topOffset + 8, cellRect.height),
                400,
            );
        }

        tooltip.style.left = `${cellRect.left}px`;
        tooltip.style.top = `${cellRect.top}px`;
        editorContainer.style.width = `${editorWidth}px`;
        editorContainer.style.height = `${editorHeight}px`;

        // Merged cells get a readonly tooltip
        const merged = this.isCellMerged();

        // Create Monaco editor
        const editor = monaco.editor.create(editorContainer, {
            value: this.value,
            language: 'python',
            theme: 'vs-dark',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: leftOffset,
            lineNumbersMinChars: 0,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: { vertical: 'hidden', horizontal: 'auto', useShadows: false },
            fontSize: 12,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: monacoLineHeight,
            padding: { top: Math.max(topOffset - 1, 0), bottom: 4 },
            automaticLayout: true,
            wordWrap: 'off',
            contextmenu: false,
            readOnly: merged,
            domReadOnly: merged,
            ...(this.singleLine ? {
                renderLineHighlight: 'none' as const,
                lineHeight: monacoLineHeight,
            } : {}),
        });
        this.editorInstance = editor;

        // Close tooltip on ESC (prevent it from closing the panel)
        editor.addCommand(monaco.KeyCode.Escape, () => {
            this.removeTooltipNow();
        });
        // Enter saves and closes; Shift+Enter inserts newline (only for editable)
        if (!merged) {
            editor.addCommand(monaco.KeyCode.Enter, () => {
                this.removeTooltipNow();
            });
        }
        tooltip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.removeTooltipNow();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.stopPropagation();
            }
        });

        this.readonlyTooltip = merged;

        // Track changes but don't save until tooltip closes
        if (!merged) {
            editor.onDidChangeModelContent(() => {
                this.pendingValue = editor.getValue() || null;
            });
        }

        // Adjust if overflowing viewport
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth - 8) {
            tooltip.style.left = `${window.innerWidth - tooltipRect.width - 8}px`;
        }
        if (tooltipRect.bottom > window.innerHeight - 8) {
            tooltip.style.top = `${window.innerHeight - tooltipRect.height - 8}px`;
        }

        // Focus editor and place cursor at approximate click position
        editor.focus();
        try {
            const target = editor.getTargetAtClientPoint(event.clientX, event.clientY);
            if (target?.position) {
                editor.setPosition(target.position);
            }
        } catch {
            // fallback: cursor at start
        }
    }

    scheduleHide(): void {
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
        this.hideTimeout = setTimeout(() => this.removeTooltip(), 200);
    }

    removeTooltipNow(): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        this.removeTooltip();
    }

    private removeTooltip(): void {
        // Save pending value before destroying (skip for readonly)
        if (this.pendingValue !== null && !this.readonlyTooltip) {
            const val = this.pendingValue;
            this.pendingValue = null;
            this.params.node.setDataValue(this.params.column!, val);
        }
        if (this.editorInstance) {
            this.editorInstance.dispose();
            this.editorInstance = null;
        }
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }

    private updateDisplayText(): void {
        if (!this.value) {
            this.displayText = '';
            return;
        }
        const firstLine = this.value.split('\n')[0].trim();
        this.displayText = this.value.includes('\n') ? firstLine + ' …' : firstLine;
    }

    private tryColorize(): void {
        if (!this.value || this.colorized) return;

        ensureMonacoLoaded().then(() => {
            if (this.destroyed || this.colorized || !this.value) return;

            const monaco = (window as any).monaco;
            if (!monaco?.editor?.colorize) return;

            // Ensure vs-dark theme is active (matches the Monaco editors elsewhere)
            monaco.editor.setTheme('vs-dark');

            const firstLine = this.value.split('\n')[0].trim();
            const suffix = this.value.includes('\n')
                ? '<span style="color:rgba(255,255,255,0.3)"> …</span>'
                : '';

            monaco.editor.colorize(firstLine, 'python', { tabSize: 4 }).then((html: string) => {
                if (!this.destroyed && this.codeContainer?.nativeElement) {
                    this.codeContainer.nativeElement.innerHTML =
                        `<span class="colorized-code">${html}${suffix}</span>`;
                    this.colorized = true;
                    this.cdr.markForCheck();
                }
            });
        });
    }
}
