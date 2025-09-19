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
})
export class NodePanelShellComponent {
    public readonly node = input<NodeModel | null>(null);
    public readonly panelComponent = input<Type<NodePanel<any>> | null>(null);
    public readonly save = output<NodeModel>();
    public readonly close = output<void>();

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

    constructor() {
        effect(() => {
            const outletRef = this.outlet();
            if (outletRef?.componentInstance) {
                this.panelInstance = outletRef.componentInstance;
                this.setupOutputSubscriptions(outletRef.componentInstance);
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
        this.close.emit();
    }
}
