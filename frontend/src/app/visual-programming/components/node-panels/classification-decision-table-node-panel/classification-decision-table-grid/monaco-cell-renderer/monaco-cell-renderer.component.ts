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
            (mouseenter)="showTooltip($event)"
            (mouseleave)="scheduleHide()"
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

    agInit(params: ICellRendererParams): void {
        this.params = params;
        this.value = params.value || '';
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

    showTooltip(event: MouseEvent): void {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
        if (!this.value || this.tooltipEl) return;

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

        // Position on top of the cell, aligned with text
        const containerRect = this.codeContainer.nativeElement.getBoundingClientRect();
        const cellPaddingLeft = 8; // .code-cell padding
        const monacoInternalLeft = 4; // Monaco's internal left margin with decorations off
        const borderWidth = 1; // tooltip border

        // Horizontal: align Monaco text start with cell text start
        const tooltipLeft = containerRect.left + cellPaddingLeft - monacoInternalLeft - borderWidth;

        // Vertical: cell text is vertically centered; first line of Monaco starts at padding.top
        // Cell center = containerRect.top + containerRect.height/2
        // Text center in cell ≈ cell center (since align-items: center)
        // Monaco first line center = padding.top + lineHeight/2
        // So: tooltipTop + padding.top + lineHeight/2 = containerRect.top + containerRect.height/2
        const monacoLineHeight = 19;
        const monacoPaddingTop = Math.max(0, Math.round(containerRect.height / 2 - monacoLineHeight / 2));

        const editorWidth = Math.max(containerRect.width - cellPaddingLeft + monacoInternalLeft + borderWidth, 550);
        const lineCount = this.value.split('\n').length;
        const editorHeight = Math.max(lineCount * monacoLineHeight + monacoPaddingTop + 8, 120);

        tooltip.style.left = `${tooltipLeft}px`;
        tooltip.style.top = `${containerRect.top - borderWidth}px`;
        editorContainer.style.width = `${editorWidth}px`;
        editorContainer.style.height = `${editorHeight}px`;

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
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: { vertical: 'hidden', horizontal: 'auto', useShadows: false },
            fontSize: 12,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: monacoLineHeight,
            padding: { top: monacoPaddingTop, bottom: 4 },
            automaticLayout: true,
            wordWrap: 'off',
            contextmenu: false,
        });
        this.editorInstance = editor;

        // Close tooltip on ESC (prevent it from closing the panel)
        editor.addCommand(monaco.KeyCode.Escape, () => {
            this.removeTooltipNow();
        });
        tooltip.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.removeTooltipNow();
            }
        });

        // Wire up content changes
        editor.onDidChangeModelContent(() => {
            const newVal = editor.getValue() || null;
            this.params.node.setDataValue(this.params.column!, newVal);
        });

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
