import { computed, Injectable, Signal, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { NodeModel } from '../core/models/node.model';
import { FlowService } from './flow.service';

@Injectable({
    providedIn: 'root',
})
export class SidePanelService {
    private readonly selectedNodeIdSignal = signal<string | null>(null);
    private readonly autosaveTriggerSignal = signal<boolean>(false);

    private readonly expandRequestSignal = signal<boolean>(false);
    public readonly expandRequest: Signal<boolean> = this.expandRequestSignal.asReadonly();

    private readonly saveNodeRequestSubject = new Subject<NodeModel>();
    public readonly saveNodeRequest$: Observable<NodeModel> = this.saveNodeRequestSubject.asObservable();

    private readonly savingNodeIdSignal = signal<string | null>(null);
    public readonly savingNodeId: Signal<string | null> = this.savingNodeIdSignal.asReadonly();

    public readonly selectedNodeId: Signal<string | null> = this.selectedNodeIdSignal.asReadonly();

    public readonly selectedNode: Signal<NodeModel | null> = computed(() => {
        const selectedId = this.selectedNodeId();
        if (!selectedId) {
            return null;
        }
        return this.flowService.nodes().find((node) => node.id === selectedId) || null;
    });

    public readonly autosaveTrigger: Signal<boolean> = this.autosaveTriggerSignal.asReadonly();

    public requestExpand(): void {
        this.expandRequestSignal.set(true);
    }

    public clearExpandRequest(): void {
        this.expandRequestSignal.set(false);
    }

    constructor(private readonly flowService: FlowService) {}

    public trySelectNode(node: NodeModel): Promise<boolean> {
        const currentId = this.selectedNodeIdSignal();

        if (currentId === node.id) {
            return Promise.resolve(true);
        }

        this.triggerAutosave();
        this.setSelectedNodeId(node.id);
        return Promise.resolve(true);
    }

    public tryClosePanel(): Promise<boolean> {
        const currentId = this.selectedNodeIdSignal();

        if (!currentId) {
            return Promise.resolve(true);
        }

        this.triggerAutosave();
        this.clearSelection();
        return Promise.resolve(true);
    }

    public clearSelection(): void {
        this.selectedNodeIdSignal.set(null);
    }

    public setSelectedNodeId(nodeId: string | null): void {
        this.selectedNodeIdSignal.set(nodeId);
    }

    public triggerAutosave(): void {
        this.autosaveTriggerSignal.set(!this.autosaveTriggerSignal());
    }

    public clearAutosaveTrigger(): void {
        this.autosaveTriggerSignal.set(false);
    }

    public requestSaveNode(node: NodeModel): void {
        this.saveNodeRequestSubject.next(node);
    }

    public markNodeSaving(nodeId: string): void {
        this.savingNodeIdSignal.set(nodeId);
    }

    public clearNodeSaving(): void {
        this.savingNodeIdSignal.set(null);
    }
}
