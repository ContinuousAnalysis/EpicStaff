import {
    Component,
    Type,
    input,
    output,
    OnDestroy,
    effect,
    signal,
    computed,
    viewChild,
    inject,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NodePanel } from '../../../core/models/node-panel.interface';
import { PanelSyncService } from '../../../services/panel-sync.service';
import { NodeModel } from '../../../core/models/node.model';

@Component({
    standalone: true,
    selector: 'app-node-panel-shell',
    imports: [NgComponentOutlet],
    template: `
        @if (node() && panelComponent()) {
        <aside class="node-panel" [class.shake-attention]="isShaking()">
            <header class="dialog-header">
                <div class="icon-and-title">
                    <i
                        [class]="node()!.icon"
                        [style.color]="node()!.color || '#685fff'"
                    ></i>
                    <span class="title">{{ nodeToDisplay() }}</span>
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
})
export class NodePanelShellComponent {
    public readonly node = input<NodeModel | null>(null);
    public readonly panelComponent = input<Type<NodePanel<any>> | null>(null);
    public readonly save = output<NodeModel>();
    public readonly close = output<void>();
    public readonly nodeToDisplay = computed(() =>
        this.node()!.node_name === '__start__'
            ? 'Start'
            : this.node()?.node_name
    );

    protected readonly outlet = viewChild(NgComponentOutlet);
    protected readonly componentInputs = computed(() => ({
        node: this.node(),
    }));

    protected readonly isShaking = signal(false);
    private panelInstance: any = null;

    constructor(private readonly panelSync: PanelSyncService) {
        effect(() => {
            const outletRef = this.outlet();
            if (outletRef?.componentInstance) {
                this.panelInstance = outletRef.componentInstance;
                this.setupOutputSubscriptions(outletRef.componentInstance);
            }
        });

        // Listen for global persist requests (e.g., header Save)
        this.panelSync.persist$.subscribe(() => {
            const updated = this.saveStateSilently();
            if (updated) {
                this.save.emit(updated);
            }
        });
    }

    private setupOutputSubscriptions(instance: any): void {
        if (instance.save && typeof instance.save.emit === 'function') {
            instance.save.subscribe((node: NodeModel) => {
                this.save.emit(node);
            });
        }

        if (instance.close && typeof instance.close.emit === 'function') {
            instance.close.subscribe(() => {
                this.close.emit();
            });
        }
    }

    protected onCloseClick(): void {
        const updated = this.saveStateSilently();
        if (updated) {
            this.save.emit(updated);
        }
        this.close.emit();
    }

    // Allows saving current panel state without closing the panel UI
    public saveStateSilently(): NodeModel | null {
        if (!this.panelInstance) return null;
        const instance: any = this.panelInstance as any;
        try {
            if (typeof instance.onSaveSilently === 'function') {
                const updated = instance.onSaveSilently();
                return updated as NodeModel;
            }
            if (typeof instance.createUpdatedNode === 'function') {
                const updated = instance.createUpdatedNode();
                return updated as NodeModel;
            }
        } catch {}
        return null;
    }
}
