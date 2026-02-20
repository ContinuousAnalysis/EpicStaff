import {
    Component,
    Inject,
    ViewEncapsulation,
    OnDestroy,
    ViewContainerRef,
    inject,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { JsonEditorComponent } from '../../../shared/components/json-editor/json-editor.component';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Overlay, OverlayRef, OverlayModule } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
    AutocompleteOverlayComponent,
    AutocompleteItem,
} from '../node-panels/decision-table-node-panel/decision-table-grid/cell-editors/expression-editor/autocomplete-overlay/autocomplete-overlay.component';
import { parseTree, findNodeAtOffset, Node as JsonNode } from 'jsonc-parser';

declare const monaco: any;

export interface DomainDialogData {
    initialData: Record<string, unknown>;
}

export const DEFAULT_INITIAL_STATE: Record<string, unknown> = {
    variables: {
        context: null,
    },
    persistent_variables: {
        user: [],
        organization: [],
    },
};

@Component({
    standalone: true,
    selector: 'app-domain-dialog',
    imports: [CommonModule, JsonEditorComponent, OverlayModule],
    encapsulation: ViewEncapsulation.None,
    template: `
        <div class="dialog-container">
            <div class="dialog-header">
                <h2 class="dialog-title">Domain Variables</h2>
                <button class="close-button" (click)="onClose()">
                    <i class="ti ti-x"></i>
                </button>
            </div>

            <div class="dialog-content">
                <div class="helper-text">
                    Here you can define your domain variables that will be
                    available throughout your workflow execution.
                </div>

                <div class="autocomplete-hint">
                    <i class="ti ti-bulb"></i>
                    <span>
                        Place your cursor inside
                        <code>user</code> or <code>organization</code> arrays
                        and press <kbd>Ctrl+Space</kbd> to pick variables from
                        <code>context</code>.
                    </span>
                </div>

                @if (pathValidationErrors().length > 0) {
                    <div class="path-validation-errors">
                        @for (path of pathValidationErrors(); track path) {
                            <div class="path-error">
                                <i class="ti ti-alert-circle"></i>
                                <span>Path {{ path }} in persistent_variables does not exist in variables</span>
                            </div>
                        }
                    </div>
                }
                <div class="json-editor-section">
                    <app-json-editor
                        class="json-editor"
                        [jsonData]="initialStateJson"
                        (jsonChange)="onInitialStateChange($event)"
                        (validationChange)="onJsonValidChange($event)"
                        (editorReady)="onEditorReady($event)"
                        [fullHeight]="true"
                    ></app-json-editor>
                </div>
            </div>

            <div class="dialog-actions">
                <button class="btn-secondary" (click)="onClose()">Close</button>
                <button
                    class="btn-primary"
                    [disabled]="!isJsonValid || pathValidationErrors().length > 0"
                    (click)="onSave()"
                >
                    Save
                </button>
            </div>
        </div>
    `,
    styles: [
        `
            .dialog-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
                background: var(--color-surface-card, #232323);
                border-radius: 8px;
                overflow: hidden;
            }

            .domain-dialog-panel {
                z-index: 9600 !important;
            }

            .dialog-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 1.5rem;
                border-bottom: 1px solid var(--color-divider-subtle, #444);
            }

            .dialog-title {
                font-size: 1.2rem;
                font-weight: 400;
                color: var(--color-text-primary, #fff);
                margin: 0;
            }

            .close-button {
                background: none;
                border: none;
                color: var(--color-text-secondary, #aaa);
                cursor: pointer;
                padding: 0.5rem;
                border-radius: 4px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;

                &:hover {
                    background: var(--color-surface-hover, #333);
                    color: var(--color-text-primary, #fff);
                }

                i {
                    font-size: 1.25rem;

                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            }

            .dialog-content {
                flex: 1;
                padding: 1.5rem;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .helper-text {
                color: #6b7280;
                font-size: 0.875rem;
                line-height: 1.4;
                margin-bottom: 0.75rem;
            }

            .autocomplete-hint {
                display: flex;
                align-items: flex-start;
                gap: 0.6rem;
                padding: 0.6rem 0.85rem;
                margin-bottom: 1rem;
                background: rgba(101, 98, 245, 0.08);
                border: 1px solid rgba(101, 98, 245, 0.2);
                border-radius: 6px;
                font-size: 0.8rem;
                line-height: 1.45;
                color: #b0b0c0;

                i {
                    color: #685fff;
                    font-size: 1rem;
                    flex-shrink: 0;
                    margin-top: 1px;
                }

                kbd {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    border-radius: 3px;
                    padding: 0.1em 0.4em;
                    font-size: 0.85em;
                    font-family: inherit;
                    color: #d0d0e0;
                }

                code {
                    background: rgba(101, 98, 245, 0.18);
                    border-radius: 3px;
                    padding: 0.1em 0.35em;
                    font-size: 0.9em;
                    color: #a5a5ff;
                }
            }

            .path-validation-errors {
                padding: 0.5rem 0.75rem;
                margin-bottom: 1rem;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 6px;
                font-size: 0.8rem;
            }

            .path-error {
                display: flex;
                align-items: flex-start;
                gap: 0.5rem;
                color: #f87171;
                line-height: 1.4;

                i {
                    flex-shrink: 0;
                    margin-top: 2px;
                    font-size: 1rem;
                }

                span {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.85em;
                }
            }

            .json-editor-section {
                flex: 1;
                min-height: 400px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                overflow: hidden;
            }

            .json-editor {
                height: 100%;
            }

            .dialog-actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.75rem;
                padding: 1rem 1.5rem;
                border-top: 1px solid var(--color-divider-subtle, #444);
            }

            .btn-primary {
                background-color: var(--accent-color, #6562f5);
                color: white;
                border: 1px solid var(--accent-color, #6562f5);
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 400;
                cursor: pointer;
                transition: all 0.2s ease;

                &:hover:not(:disabled) {
                    background-color: #5a5ae0;
                    border-color: #5a5ae0;
                }

                &:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            }

            .btn-secondary {
                background-color: transparent;
                color: var(--color-text-primary, #fff);
                border: 1px solid var(--color-divider-subtle, #444);
                padding: 0.5rem 1rem;
                border-radius: 6px;
                font-size: 0.875rem;
                font-weight: 400;
                cursor: pointer;
                transition: all 0.2s ease;

                &:hover {
                    background-color: var(--color-surface-hover, #333);
                }
            }
        `,
    ],
})
export class DomainDialogComponent implements OnDestroy {
    public initialStateJson: string = '{}';
    public isJsonValid: boolean = true;
    public pathValidationErrors = signal<string[]>([]);

    private monacoEditor: any = null;
    private overlayService = inject(Overlay);
    private viewContainerRef = inject(ViewContainerRef);
    private overlayRef: OverlayRef | null = null;
    private autocompleteInstance: AutocompleteOverlayComponent | null = null;
    private currentPath: string[] = [];
    private contextObject: any = null;
    private keyDownDisposable: any = null;
    private cursorDisposable: any = null;

    constructor(
        private dialogRef: DialogRef<Record<string, unknown> | null>,
        @Inject(DIALOG_DATA) public data: DomainDialogData
    ) {
        this.initializeJsonEditor();
    }

    ngOnDestroy(): void {
        this.closeOverlay();
        this.keyDownDisposable?.dispose();
        this.cursorDisposable?.dispose();
    }

    // --- JSON Editor setup ---

    private initializeJsonEditor(): void {
        const initial = this.data?.initialData as
            | Record<string, unknown>
            | undefined;
        const isEmptyObject =
            initial && typeof initial === 'object' && !Array.isArray(initial)
                ? Object.keys(initial).length === 0
                : true;

        if (initial && !isEmptyObject) {
            try {
                this.initialStateJson = JSON.stringify(initial, null, 2);
                this.isJsonValid = true;
            } catch (e) {
                this.initialStateJson = JSON.stringify(
                    DEFAULT_INITIAL_STATE,
                    null,
                    2
                );
                this.isJsonValid = false;
            }
        } else {
            this.initialStateJson = JSON.stringify(DEFAULT_INITIAL_STATE, null, 2);
            this.isJsonValid = true;
        }
        this.validatePathsInPersistentVariables(this.initialStateJson);
    }

    private validatePathsInPersistentVariables(json: string): void {
        const errors: string[] = [];
        try {
            const parsed = JSON.parse(json);
            const context = parsed?.variables?.context;
            const pv = parsed?.persistent_variables;
            if (!pv || typeof pv !== 'object') return;

            const arrays = [
                { arr: pv.user, name: 'user' },
                { arr: pv.organization, name: 'organization' },
            ];
            for (const { arr } of arrays) {
                if (!Array.isArray(arr)) continue;
                for (const item of arr) {
                    const path = typeof item === 'string' ? item.trim() : null;
                    if (!path || !path.startsWith('context.')) continue;

                    const pathParts = path.slice('context.'.length).split('.');
                    if (!this.pathExistsInObject(context, pathParts)) {
                        errors.push(path);
                    }
                }
            }
        } catch {
            return;
        }
        this.pathValidationErrors.set(errors);
    }

    private pathExistsInObject(obj: any, pathParts: string[]): boolean {
        if (obj === null || obj === undefined) return false;
        if (pathParts.length === 0) return true;
        let current = obj;
        for (const part of pathParts) {
            if (current === null || current === undefined || typeof current !== 'object') {
                return false;
            }
            if (!Object.prototype.hasOwnProperty.call(current, part)) {
                return false;
            }
            current = current[part];
        }
        return true;
    }

    public onInitialStateChange(json: string): void {
        this.initialStateJson = json;
        this.validatePathsInPersistentVariables(json);
    }

    public onJsonValidChange(isValid: boolean): void {
        this.isJsonValid = isValid;
    }

    public onSave(): void {
        if (!this.isJsonValid || this.pathValidationErrors().length > 0) {
            return;
        }

        try {
            let parsedData: unknown = JSON.parse(this.initialStateJson);
            if (
                parsedData &&
                typeof parsedData === 'object' &&
                !Array.isArray(parsedData) &&
                Object.keys(parsedData as Record<string, unknown>).length === 0
            ) {
                parsedData = { ...DEFAULT_INITIAL_STATE };
            }
            this.dialogRef.close(parsedData as Record<string, unknown>);
        } catch (e) {
            this.dialogRef.close({ ...DEFAULT_INITIAL_STATE });
        }
    }

    public onClose(): void {
        this.dialogRef.close(null);
    }

    // --- Monaco editor & autocomplete setup ---

    public onEditorReady(editor: any): void {
        this.monacoEditor = editor;
        this.setupAutocomplete();
    }

    private setupAutocomplete(): void {
        if (!this.monacoEditor) return;

        this.monacoEditor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space,
            () => this.handleCtrlSpace()
        );

        this.keyDownDisposable = this.monacoEditor.onKeyDown((e: any) => {
            if (!this.overlayRef?.hasAttached() || !this.autocompleteInstance) return;

            const key = e.browserEvent.key;

            if (key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                this.autocompleteInstance.navigateNext();
            } else if (key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                this.autocompleteInstance.navigatePrev();
            } else if (key === 'Enter' || key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.autocompleteInstance.selectActive();
            } else if (key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.closeOverlay();
            } else if (key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                const active = this.autocompleteInstance.activeItem();
                if (active && active.type === 'group') {
                    this.onNavigateDown(active);
                }
            } else if (key === 'ArrowLeft') {
                e.preventDefault();
                e.stopPropagation();
                if (this.currentPath.length > 0) {
                    this.onNavigateUp();
                }
            }
        });

        this.cursorDisposable = this.monacoEditor.onDidChangeCursorPosition(() => {
            if (!this.overlayRef?.hasAttached()) return;

            const model = this.monacoEditor.getModel();
            const position = this.monacoEditor.getPosition();
            const offset = model.getOffsetAt(position);
            const text = model.getValue();

            if (!this.isCursorInTargetArray(text, offset)) {
                this.closeOverlay();
            }
        });
    }

    // --- Ctrl+Space handler ---

    private handleCtrlSpace(): void {
        if (this.overlayRef?.hasAttached()) {
            this.closeOverlay();
            return;
        }

        const model = this.monacoEditor.getModel();
        const position = this.monacoEditor.getPosition();
        const offset = model.getOffsetAt(position);
        const text = model.getValue();

        if (this.isCursorInTargetArray(text, offset)) {
            const contextObj = this.extractContextObject(text);
            if (contextObj && typeof contextObj === 'object' && Object.keys(contextObj).length > 0) {
                this.contextObject = contextObj;
                this.currentPath = [];
                this.openOverlay();
            } else {
                this.contextObject = null;
                this.currentPath = [];
                this.openOverlay(
                    'Define variables inside "context" object first, then use Ctrl+Space here to pick them.'
                );
            }
        } else {
            this.monacoEditor.trigger('keyboard', 'editor.action.triggerSuggest', {});
        }
    }

    // --- Cursor position detection via jsonc-parser ---

    private isCursorInTargetArray(text: string, offset: number): boolean {
        const root = parseTree(text);
        if (!root) return false;

        const node = findNodeAtOffset(root, offset, true);
        if (!node) return false;

        let current: JsonNode | undefined = node;
        while (current) {
            if (current.type === 'array' && current.parent) {
                const prop = current.parent;
                if (
                    prop.type === 'property' &&
                    prop.children &&
                    prop.children.length > 0
                ) {
                    const keyNode = prop.children[0];
                    if (
                        keyNode.type === 'string' &&
                        (keyNode.value === 'user' || keyNode.value === 'organization')
                    ) {
                        const grandParent = prop.parent;
                        if (grandParent?.type === 'object' && grandParent.parent) {
                            const pvProp = grandParent.parent;
                            if (
                                pvProp.type === 'property' &&
                                pvProp.children?.[0]?.value === 'persistent_variables'
                            ) {
                                return true;
                            }
                        }
                    }
                }
            }
            current = current.parent;
        }
        return false;
    }

    private extractContextObject(text: string): any {
        try {
            const parsed = JSON.parse(text);
            return parsed?.variables?.context ?? null;
        } catch {
            return null;
        }
    }

    // --- Autocomplete items ---

    private buildAutocompleteItems(): AutocompleteItem[] {
        if (!this.contextObject) return [];

        let current: any = this.contextObject;
        for (const key of this.currentPath) {
            if (current && typeof current === 'object') {
                current = current[key];
            } else {
                return [];
            }
        }

        if (!current || typeof current !== 'object') return [];

        return Object.keys(current).map((key) => ({
            key,
            path: [...this.currentPath, key].join('.'),
            type:
                typeof current[key] === 'object' && current[key] !== null
                    ? ('group' as const)
                    : ('value' as const),
            value: current[key],
        }));
    }

    // --- CDK Overlay management ---

    private openOverlay(emptyMessage?: string): void {
        if (this.overlayRef?.hasAttached()) {
            this.closeOverlay();
        }

        const position = this.monacoEditor.getPosition();
        const scrolledPos = this.monacoEditor.getScrolledVisiblePosition(position);
        const editorDom = this.monacoEditor.getDomNode();

        const positionStrategy = this.overlayService
            .position()
            .flexibleConnectedTo(editorDom)
            .withPositions([
                {
                    originX: 'start',
                    originY: 'top',
                    overlayX: 'start',
                    overlayY: 'top',
                    offsetX: scrolledPos.left,
                    offsetY: scrolledPos.top + scrolledPos.height,
                },
                {
                    originX: 'start',
                    originY: 'top',
                    overlayX: 'start',
                    overlayY: 'bottom',
                    offsetX: scrolledPos.left,
                    offsetY: scrolledPos.top,
                },
            ])
            .withPush(true)
            .withViewportMargin(8);

        this.overlayRef = this.overlayService.create({
            positionStrategy,
            scrollStrategy: this.overlayService.scrollStrategies.reposition(),
            hasBackdrop: false,
        });

        const portal = new ComponentPortal(
            AutocompleteOverlayComponent,
            this.viewContainerRef
        );
        const componentRef = this.overlayRef.attach(portal);
        this.autocompleteInstance = componentRef.instance;

        const overlayEl = this.overlayRef.overlayElement;
        overlayEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setTimeout(() => this.monacoEditor.focus());
        });

        this.autocompleteInstance.itemSelected.subscribe((item: AutocompleteItem) =>
            this.onItemSelect(item)
        );
        this.autocompleteInstance.navigateUp.subscribe(() => this.onNavigateUp());
        this.autocompleteInstance.navigateDown.subscribe(
            (item: AutocompleteItem) => this.onNavigateDown(item)
        );
        this.autocompleteInstance.navigateToPath.subscribe((index: number) =>
            this.onNavigateToPath(index)
        );

        const items = this.buildAutocompleteItems();
        this.autocompleteInstance.updateData(
            items,
            this.currentPath,
            '',
            'context',
            emptyMessage,
        );
    }

    private closeOverlay(): void {
        if (this.overlayRef) {
            this.overlayRef.dispose();
            this.overlayRef = null;
            this.autocompleteInstance = null;
        }
    }

    // --- Item selection & insertion ---

    private onItemSelect(item: AutocompleteItem): void {
        const model = this.monacoEditor.getModel();
        const position = this.monacoEditor.getPosition();
        const offset = model.getOffsetAt(position);
        const text = model.getValue();

        const insertValue = `context.${item.path}`;

        const root = parseTree(text);
        const nodeAtCursor = root ? findNodeAtOffset(root, offset, true) : undefined;
        const stringNode = this.findEnclosingStringNode(nodeAtCursor);

        if (stringNode) {
            const startPos = model.getPositionAt(stringNode.offset + 1);
            const endPos = model.getPositionAt(
                stringNode.offset + stringNode.length - 1
            );
            this.monacoEditor.executeEdits('autocomplete', [
                {
                    range: new monaco.Range(
                        startPos.lineNumber,
                        startPos.column,
                        endPos.lineNumber,
                        endPos.column
                    ),
                    text: insertValue,
                },
            ]);
        } else {
            this.monacoEditor.executeEdits('autocomplete', [
                {
                    range: new monaco.Range(
                        position.lineNumber,
                        position.column,
                        position.lineNumber,
                        position.column
                    ),
                    text: `"${insertValue}"`,
                },
            ]);
        }

        this.closeOverlay();
        this.monacoEditor.focus();
    }

    private findEnclosingStringNode(
        node: JsonNode | undefined
    ): JsonNode | null {
        let current = node;
        while (current) {
            if (current.type === 'string') return current;
            current = current.parent;
        }
        return null;
    }

    // --- Hierarchical navigation ---

    private onNavigateDown(item: AutocompleteItem): void {
        this.currentPath = [...this.currentPath, item.key];
        this.updateOverlayData();
    }

    private onNavigateUp(): void {
        if (this.currentPath.length === 0) return;
        this.currentPath = this.currentPath.slice(0, -1);
        this.updateOverlayData();
    }

    private onNavigateToPath(index: number): void {
        if (index === -1) {
            this.currentPath = [];
        } else {
            this.currentPath = this.currentPath.slice(0, index + 1);
        }
        this.updateOverlayData();
    }

    private updateOverlayData(): void {
        if (!this.autocompleteInstance) return;
        const items = this.buildAutocompleteItems();
        this.autocompleteInstance.updateData(items, this.currentPath, '', 'context');
    }
}
