import {
    Component,
    Type,
    input,
    output,
    effect,
    signal,
    computed,
    viewChild,
    ChangeDetectionStrategy,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NodePanel } from '../../../core/models/node-panel.interface';
import { NodeModel } from '../../../core/models/node.model';
import { PANEL_COMPONENT_MAP } from '../../../core/enums/node-panel.map';
import { ShortcutListenerDirective } from '../../../core/directives/shortcut-listener.directive';
import { SidepanelAutosaveService } from '../../../services/sidepanel-autosave.service';

@Component({
    standalone: true,
    selector: 'app-node-panel-shell',
    imports: [NgComponentOutlet],
    hostDirectives: [
        {
            directive: ShortcutListenerDirective,
            outputs: ['escape: escape'],
        },
    ],
    host: {
        '(escape)': 'onEscape()',
    },
    template: `
        @if (node() && panelComponent()) {
        <aside class="node-panel" [class.shake-attention]="isShaking()">
            <header class="dialog-header">
                <div class="icon-and-title">
                    <i
                        [class]="node()!.icon"
                        [style.color]="node()!.color || '#685fff'"
                    ></i>
                    <span class="title">{{ nodeNameToDisplay() }}</span>
                </div>
                <div class="header-actions">
                    <div class="close-action">
                        <span class="esc-label">ESC</span>
                        <button
                            class="close-btn"
                            aria-label="Close dialog"
                            (click)="onCloseClick()"
                        >
                            <i class="ti ti-x"></i>
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <ng-container
                    [ngComponentOutlet]="panelComponent()"
                    [ngComponentOutletInputs]="componentInputs()"
                    #outlet="ngComponentOutlet"
                ></ng-container>
            </main>
        </aside>
        }
    `,
    styleUrls: ['./node-panel-shell.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodePanelShellComponent {
    public readonly node = input<NodeModel | null>(null);
    public readonly save = output<NodeModel>();
    public readonly autosave = output<NodeModel>();

    public readonly panelComponent = computed(() => {
        const node = this.node();
        if (!node) return null;
        return PANEL_COMPONENT_MAP[node.type] || null;
    });

    public readonly nodeNameToDisplay = computed(() => {
        const n = this.node();
        if (!n) return '';
        if (n.node_name === '__start__') return 'Start';
        if (n.type === 'end' || n.node_name === '__end_node__') return 'End';
        return n.node_name;
    });

    protected readonly outlet = viewChild(NgComponentOutlet);
    protected readonly componentInputs = computed(() => ({
        node: this.node(),
    }));

    protected readonly isShaking = signal(false);
    private panelInstance: any = null;
    private previousNodeId: string | null = null;
    private isUpdatingNode = false;
    private isAutosaving = false;

    constructor(private autosaveService: SidepanelAutosaveService) {
        effect(() => {
            const trigger = this.autosaveService.autosaveTrigger();
            if (trigger && this.panelInstance && !this.isAutosaving) {
                console.log('External autosave triggered:', trigger);
                this.isAutosaving = true;
                this.performAutosave();
                // Reset flag after a short delay
                setTimeout(() => {
                    this.isAutosaving = false;
                }, 100);
            }
        });

        effect(() => {
            const node = this.node();
            if (node) {
                // Check if we're switching to a different node
                if (
                    this.previousNodeId &&
                    this.previousNodeId !== node.id &&
                    this.panelInstance &&
                    !this.isUpdatingNode &&
                    !this.isAutosaving
                ) {
                    // Auto-save the previous node before switching
                    this.isUpdatingNode = true;
                    this.performAutosave();
                }

                // Use setTimeout to ensure Angular has finished updating the component
                setTimeout(() => {
                    const outletRef = this.outlet();
                    if (outletRef?.componentInstance) {
                        this.panelInstance = outletRef.componentInstance;
                        this.previousNodeId = node.id;
                        this.isUpdatingNode = false;
                        console.log(
                            'Panel instance updated for node:',
                            node.id,
                            this.panelInstance
                        );
                    }
                }, 0);
            } else {
                // Reset when no node is selected
                this.panelInstance = null;
                this.previousNodeId = null;
                this.isUpdatingNode = false;
                this.isAutosaving = false;
            }
        });
    }

    protected onCloseClick(): void {
        this.saveSidePanel();
    }

    protected onEscape(): void {
        this.saveSidePanel();
    }

    private saveSidePanel(): void {
        console.log('Saving side panel');
        if (
            this.panelInstance &&
            typeof this.panelInstance.onSave === 'function'
        ) {
            console.log('Panel instance found');
            const updatedNode = this.panelInstance.onSave();
            if (updatedNode) {
                this.save.emit(updatedNode);
            }
        }
    }

    private performAutosave(): void {
        console.log('Auto-saving previous node');
        if (
            this.panelInstance &&
            typeof this.panelInstance.onSave === 'function'
        ) {
            const updatedNode = this.panelInstance.onSave();
            if (updatedNode) {
                this.autosave.emit(updatedNode);
            }
        }
    }
}
