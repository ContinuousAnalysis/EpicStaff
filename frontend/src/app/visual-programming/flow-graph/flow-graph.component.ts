import { Dialog } from '@angular/cdk/dialog';
import {
    afterNextRender,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    inject,
    Injector,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    output,
    signal,
    SimpleChanges,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IPoint, PointExtensions } from '@foblex/2d';
import {
    EFMarkerType,
    EFResizeHandleType,
    EFZoomDirection,
    FCanvasComponent,
    FCreateConnectionEvent,
    FCreateNodeEvent,
    FDragNodeStartEventData,
    FDragStartedEvent,
    FFlowComponent,
    FFlowModule,
    FReassignConnectionEvent,
    FZoomDirective,
    ICurrentSelection,
} from '@foblex/flow';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { ToastService } from '../../services/notifications/toast.service';
import { DomainDialogComponent } from '../components/domain-dialog/domain-dialog.component';
import { FlowActionPanelComponent } from '../components/flow-action-panel/flow-action-panel.component';
import { FlowBaseNodeComponent } from '../components/flow-base-node/flow-base-node.component';
import { FlowGraphContextMenuComponent } from '../components/flow-graph-context-menu/flow-graph-context-menu.component';
import { FlowNodePanelComponent } from '../components/flow-nodes-panel/flow-nodes-panel.component';
import { FlowShortcutsButtonComponent } from '../components/flow-shortcuts-button/flow-shortcuts-button.component';
import { NodePanelShellComponent } from '../components/node-panels/node-panel-shell/node-panel-shell.component';
import { NodesSearchComponent } from '../components/nodes-search/nodes-search.component';
import { NoteEditDialogComponent } from '../components/note-edit-dialog/note-edit-dialog.component';
import { ProjectDialogComponent } from '../components/project-dialog/project-dialog.component';
import { MouseTrackerDirective } from '../core/directives/mouse-tracker.directive';
import { ShortcutListenerDirective } from '../core/directives/shortcut-listener.directive';
import { NODE_COLORS, NODE_ICONS } from '../core/enums/node-config';
import { NodeType } from '../core/enums/node-type';
import { getMinimapClassForNode } from '../core/helpers/get-minimap-class.util';
import {
    defineSourceTargetPair,
    generatePortsForDecisionTableNode,
    generatePortsForNode,
    isConnectionValid,
} from '../core/helpers/helpers';
import {
    findNearestFreePosition,
    getCollisionBounds,
    GRID_CELL_SIZE,
    resolveDraggedNodePositions,
    resolveOverlapsForNode,
    snapPointToGrid,
} from '../core/helpers/node-placement.utils';
import { ensureNodeSize, normalizeTableNodeSize } from '../core/helpers/node-size.util';
import { ConnectionModel } from '../core/models/connection.model';
import { FlowModel } from '../core/models/flow.model';
import { GraphNoteModel, NodeModel, ProjectNodeModel, StartNodeModel } from '../core/models/node.model';
import { CreateNodeRequest } from '../core/models/node-creation.types';
import { CustomPortId } from '../core/models/port.model';
import { ClipboardService } from '../services/clipboard.service';
import { FlowService } from '../services/flow.service';
import { NodeFactoryService } from '../services/node-factory.service';
import { SidePanelService } from '../services/side-panel.service';
import { UndoRedoService } from '../services/undo-redo.service';

@Component({
    selector: 'app-flow-graph',
    templateUrl: './flow-graph.component.html',
    styleUrls: ['../styles/_variables.scss', './flow-graph.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        FFlowModule,
        FZoomDirective,
        FormsModule,
        FlowBaseNodeComponent,
        ShortcutListenerDirective,
        MouseTrackerDirective,
        FlowGraphContextMenuComponent,
        FlowActionPanelComponent,
        FlowNodePanelComponent,
        NodesSearchComponent,
        NodePanelShellComponent,
        FlowShortcutsButtonComponent,
    ],
})
export class FlowGraphComponent implements OnInit, OnChanges, OnDestroy {
    @Input() flowState!: FlowModel;
    @Input() currentFlowId: number | null = null;
    @Input() initialNodeId: string | null = null;

    @Output() save = new EventEmitter<void>();
    readonly openShortcuts = output<DOMRect>();

    @ViewChild(FFlowComponent, { static: false })
    private fFlowComponent!: FFlowComponent;

    @ViewChild(FCanvasComponent, { static: true })
    private fCanvasComponent!: FCanvasComponent;

    @ViewChild(FZoomDirective, { static: true })
    private fZoomDirective!: FZoomDirective;

    @ViewChild('nodePanelShell', { static: false })
    private nodePanelShell?: NodePanelShellComponent;

    readonly GRID_CELL_SIZE = GRID_CELL_SIZE;
    protected readonly getMinimapClassForNode = getMinimapClassForNode;
    protected readonly eMarkerType = EFMarkerType;
    protected readonly eResizeHandleType = EFResizeHandleType;
    protected readonly NodeType = NodeType;

    protected mouseCursorPosition: IPoint = { x: 0, y: 0 };
    protected contextMenuPosition = signal<IPoint>({ x: 0, y: 0 });
    protected isLoaded = signal(false);
    protected showContextMenu = signal(false);
    protected showVariables = signal(false);

    private readonly destroy$ = new Subject<void>();
    private draggedNodeIds = new Set<string>();
    private draggingElements = new Set<string>();
    private isDragging = false;

    protected readonly flowService = inject(FlowService);
    protected readonly sidePanelService = inject(SidePanelService);
    private readonly undoRedoService = inject(UndoRedoService);
    private readonly clipboardService = inject(ClipboardService);
    private readonly nodeFactory = inject(NodeFactoryService);
    private readonly cd = inject(ChangeDetectorRef);
    private readonly dialog = inject(Dialog);
    private readonly toastService = inject(ToastService);
    private readonly injector = inject(Injector);

    public ngOnInit(): void {
        this.applyIncomingFlowState();
        if (this.initialNodeId) {
            this.openNodePanel(this.initialNodeId);
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['flowState'] && !changes['flowState'].firstChange) {
            this.applyIncomingFlowState();
        }
        if (changes['initialNodeId'] && changes['initialNodeId'].currentValue) {
            this.openNodePanel(changes['initialNodeId'].currentValue);
        }
    }

    private applyIncomingFlowState(): void {
        this.initializeFlowStateIfEmpty();
        this.addStartNodeIfNeeded();
        this.generatePortsForNodesIfNeeded();
        this.sanitizeConnections();
        this.flowService.setFlow(this.flowState);
    }

    /**
     * Strips connections that reference ports not actually present on the rendered nodes.
     * Prevents f-flow errors like "fOutput with id ...table-out not found".
     */
    private sanitizeConnections(): void {
        const portIds = new Set<string>();
        for (const node of this.flowState.nodes) {
            if (node.ports) {
                for (const port of node.ports) {
                    portIds.add(port.id);
                }
            }
        }
        const before = this.flowState.connections.length;
        this.flowState.connections = this.flowState.connections.filter((conn) => {
            const srcOk = portIds.has(conn.sourcePortId);
            const tgtOk = portIds.has(conn.targetPortId);
            if (!srcOk || !tgtOk) {
                console.warn(
                    `[flow-graph] Removing invalid connection ${conn.id}: ` +
                        `sourcePort "${conn.sourcePortId}" ${srcOk ? 'OK' : 'MISSING'}, ` +
                        `targetPort "${conn.targetPortId}" ${tgtOk ? 'OK' : 'MISSING'}`
                );
            }
            return srcOk && tgtOk;
        });
        if (this.flowState.connections.length < before) {
            console.warn(`[flow-graph] Removed ${before - this.flowState.connections.length} invalid connections`);
        }
    }

    private initializeFlowStateIfEmpty(): void {
        if (!this.flowState || !Array.isArray(this.flowState.nodes)) {
            this.flowState = {
                nodes: [],
                connections: [],
            };
        }
    }

    private addStartNodeIfNeeded(): void {
        // Check if a Start node already exists
        const alreadyHasStart: boolean = this.flowState.nodes.some((node) => node.type === NodeType.START);

        if (!alreadyHasStart) {
            // Generate unique ID
            const newStartNodeId: string = uuidv4();

            // Create a new Start node
            const startNode: StartNodeModel = {
                id: newStartNodeId,
                backendId: null,
                category: 'web',
                type: NodeType.START,
                node_name: '__start__',
                data: {
                    initialState: {},
                },
                position: { x: 0, y: 0 },
                ports: generatePortsForNode(newStartNodeId, NodeType.START),
                color: NODE_COLORS[NodeType.START],
                icon: NODE_ICONS[NodeType.START],
                input_map: {},
                output_variable_path: null,
                size: { width: 125, height: 60 },
            };

            // Add Start node to the flow
            this.flowState.nodes.push(startNode);
        }
    }

    private generatePortsForNodesIfNeeded(): void {
        this.flowState.nodes = this.flowState.nodes.map((node) => {
            if (node.ports === null) {
                node.ports = generatePortsForNode(node.id, node.type, node.data);
            } else if (node.type === NodeType.TABLE) {
                const tableData = node.data.table;
                const conditionGroups = tableData?.condition_groups ?? [];
                const validGroups = conditionGroups.filter((group) => group?.valid === true);
                const expectedPortCount = 1 + validGroups.length + 2;

                if (node.ports.length !== expectedPortCount) {
                    node.ports = generatePortsForDecisionTableNode(node.id, conditionGroups);
                }
            }
            return node;
        });
    }

    public onInitialized(): void {
        // this.fCanvasComponent.fitToScreen(new Point(140, 140), false);
        this.isLoaded.set(true);
    }

    public onReassignConnection(event: FReassignConnectionEvent): void {
        // Validate that we have the necessary information
        if (!event.newTargetId && !event.newSourceId) {
            console.warn('No new target or source provided for reassignment');
            return;
        }

        this.undoRedoService.stateChanged();

        // Find the existing connection to reassign
        const existingConnection = this.flowService.connections().find((conn) => conn.id === event.connectionId);

        if (!existingConnection) {
            console.warn('Connection not found for reassignment:', event.connectionId);
            return;
        }

        // Determine the new source and target ports
        const newSourcePortId = event.newSourceId || existingConnection.sourcePortId;
        const newTargetPortId = event.newTargetId || existingConnection.targetPortId;

        // Validate the new connection using the existing validation rules
        if (!isConnectionValid(newSourcePortId as CustomPortId, newTargetPortId as CustomPortId)) {
            console.warn('New connection is invalid. Reassignment aborted.');
            this.toastService.warning('Cannot reassign connection: Invalid port combination', 5000, 'bottom-right');
            return;
        }

        // Extract node IDs from the new port IDs
        const newSourceNodeId = newSourcePortId.split('_')[0];
        const newTargetNodeId = newTargetPortId.split('_')[0];

        // Create the updated connection
        const updatedConnection: ConnectionModel = {
            id: `${newSourcePortId}+${newTargetPortId}`,
            category: 'default',
            sourceNodeId: newSourceNodeId,
            targetNodeId: newTargetNodeId,
            sourcePortId: newSourcePortId as CustomPortId,
            targetPortId: newTargetPortId as CustomPortId,
            behavior: 'fixed',
            type: 'segment',
        };

        // Remove the old connection and add the new one
        this.flowService.removeConnection(event.connectionId);
        this.flowService.addConnection(updatedConnection);

        this.toastService.success('Connection reassigned successfully', 3000, 'bottom-right');
    }

    public onConnectionAdded(event: FCreateConnectionEvent): void {
        // Save the state for undo before adding the connection
        this.undoRedoService.stateChanged();

        const { fOutputId, fInputId } = event;

        if (!fInputId) {
            console.warn('Connection event received without an input ID:', event);
            return;
        }

        if (!isConnectionValid(fOutputId as CustomPortId, fInputId as CustomPortId)) {
            console.warn('Connection is invalid and will not be added:', fOutputId, fInputId);
            return;
        }

        const pair = defineSourceTargetPair(fOutputId as CustomPortId, fInputId as CustomPortId);
        if (!pair) {
            console.warn('Failed to define source-target pair for ports:', fOutputId, fInputId);
            return;
        }

        // Generate a new connection ID
        const newConnectionId: CustomPortId = `${pair.sourcePortId}+${pair.targetPortId}` as CustomPortId;

        // Get the current list of connections from the flow service
        const currentConnections = this.flowService.connections();

        // If the connection already exists, don't add it
        const isDuplicate = currentConnections.some((conn) => conn.id === newConnectionId);
        if (isDuplicate) {
            console.warn('Duplicate connection detected, ignoring:', newConnectionId);
            return;
        }

        // Extract the source and target node IDs from the port IDs
        const sourceNodeId = pair.sourcePortId.split('_')[0];
        const targetNodeId = pair.targetPortId.split('_')[0];

        // Create the new connection object based on your models
        const newConnection: ConnectionModel = {
            id: newConnectionId,
            category: 'default',
            sourceNodeId: sourceNodeId,
            targetNodeId: targetNodeId,
            sourcePortId: pair.sourcePortId as CustomPortId,
            targetPortId: pair.targetPortId as CustomPortId,
            behavior: 'fixed',
            type: 'segment',
        };
        // Add the new connection to the flow service
        this.flowService.addConnection(newConnection);
    }

    public onCopy(): void {
        if (this.isDialogOpen()) {
            return;
        }

        // Assume fFlowComponent.getSelection() returns a FSelectionChangeEvent

        const selections: ICurrentSelection = this.fFlowComponent.getSelection();
        this.clipboardService.copy(selections);
    }
    public onPaste(): void {
        if (this.isDialogOpen()) {
            return;
        }

        const pastePosition = this.mouseCursorPosition
            ? snapPointToGrid(this.toFlowPosition(this.mouseCursorPosition))
            : { x: 0, y: 0 };

        this.undoRedoService.stateChanged();
        const { newNodes, newConnections } = this.clipboardService.paste(pastePosition);
        const placedNodes: NodeModel[] = [];
        const existingBeforePaste = this.flowService.nodes().filter((n) => !newNodes.some((p) => p.id === n.id));

        for (const rawNode of newNodes) {
            const node = ensureNodeSize(rawNode as NodeModel);
            const safePosition = findNearestFreePosition(snapPointToGrid(node.position), getCollisionBounds(node), [
                ...existingBeforePaste,
                ...placedNodes,
            ]);

            const updatedNode = { ...node, position: safePosition };
            this.flowService.updateNode(updatedNode);
            placedNodes.push(updatedNode);
        }

        const newNodeIds = newNodes.map((node) => node.id);
        const newConnectionIds = newConnections.map((conn) => conn.id);

        setTimeout(() => {
            this.fFlowComponent.select(newNodeIds, newConnectionIds);
        }, 0);
    }

    public onUndo(): void {
        if (this.isDialogOpen()) {
            return;
        }

        this.undoRedoService.onUndo();
    }

    public onRedo(): void {
        if (this.isDialogOpen()) {
            return;
        }

        this.undoRedoService.onRedo();
    }
    public onDelete(): void {
        if (this.isDialogOpen()) {
            return;
        }

        const selections: ICurrentSelection = this.fFlowComponent.getSelection();
        this.deleteSelections(selections);
    }

    public onDeleteConnection(event: MouseEvent, connectionId: string): void {
        event.preventDefault();
        event.stopPropagation();

        if (this.isDialogOpen()) {
            return;
        }

        this.deleteSelections({
            fNodeIds: [],
            fGroupIds: [],
            fConnectionIds: [connectionId],
        });
    }

    public onNodeDroppedFromPanel(event: FCreateNodeEvent<NodeModel>): void {
        const node = event.data;
        const position = findNearestFreePosition(
            snapPointToGrid(event.dropPosition ?? event.externalItemRect),
            getCollisionBounds(node),
            this.flowService.nodes()
        );
        this.flowService.updateNode({ ...node, position });
    }

    public onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
        this.showContextMenu.set(true);
    }
    public onCloseContextMenu(): void {
        this.showContextMenu.set(false);
    }
    public onAddNodeFromContextMenu(event: CreateNodeRequest): void {
        this.undoRedoService.stateChanged();
        this.showContextMenu.set(false);

        if (event.type === NodeType.END && this.flowService.hasEndNode()) {
            this.toastService.warning('Only one End node is allowed', 4000, 'bottom-right');
            return;
        }

        const positionInFlow = this.toFlowPosition(this.contextMenuPosition());

        const newNode = this.nodeFactory.createNode(event.type, { ...event.overrides, position: positionInFlow });
        this.flowService.addNode(newNode);
    }

    // side panel logic
    public onOpenNodePanel(node: NodeModel): void {
        if (this.sidePanelService.selectedNodeId() === node.id) {
            return;
        }

        if (node.type === NodeType.NOTE) {
            const noteNode = node as GraphNoteModel;

            const dialogRef = this.dialog.open(NoteEditDialogComponent, {
                data: { node: noteNode },
                disableClose: true,
            });

            dialogRef.closed.subscribe((result: unknown) => {
                if (
                    result !== null &&
                    typeof result === 'object' &&
                    'content' in result &&
                    typeof (result as { content?: unknown }).content !== 'undefined'
                ) {
                    const content = (result as { content?: unknown }).content;
                    if (typeof content !== 'string') return;
                    const updatedNode: GraphNoteModel = {
                        ...noteNode,
                        data: {
                            ...noteNode.data,
                            content,
                        },
                    };

                    this.flowService.updateNode(updatedNode);

                    this.cd.detectChanges();
                }
            });
        } else if (node.type === NodeType.START) {
            const startNode = node as StartNodeModel;
            const startNodeInitialState = startNode.data?.initialState || {};

            const dialogRef = this.dialog.open(DomainDialogComponent, {
                disableClose: true,
                width: '1000px',
                height: '800px',
                maxWidth: '90vw',
                maxHeight: '90vh',
                panelClass: 'domain-dialog-panel',
                backdropClass: 'domain-dialog-backdrop',
                data: {
                    initialData: startNodeInitialState,
                },
            });

            dialogRef.closed.subscribe((result: unknown) => {
                if (result !== null && typeof result === 'object' && result !== undefined) {
                    this.updateStartNodeInitialState(result as Record<string, unknown>);
                }
            });
        } else {
            void this.sidePanelService.trySelectNode(node);
        }
    }

    public onNodePanelSaved(updatedNode: NodeModel): void {
        const normalizedNode = normalizeTableNodeSize(updatedNode);
        this.flowService.updateNode(normalizedNode);
        this.resolveTableOverlaps(normalizedNode);
        this.sidePanelService.clearSelection();
    }

    public onNodePanelAutosaved(updatedNode: NodeModel): void {
        const normalizedNode = normalizeTableNodeSize(updatedNode);
        this.flowService.updateNode(normalizedNode);
        this.resolveTableOverlaps(normalizedNode);
    }

    public flushOpenSidePanelState(): void {
        const updatedNode = this.nodePanelShell?.captureCurrentNodeState();
        if (updatedNode) {
            this.flowService.updateNode(updatedNode);
        }
    }

    public onNodeSizeChanged(event: { width: number; height: number }, node: NodeModel): void {
        this.undoRedoService.stateChanged();

        const updatedNode = {
            ...node,
            size: {
                width: event.width,
                height: event.height,
            },
        };

        this.flowService.updateNode(updatedNode);
    }

    public onZoomInNode(node: NodeModel): void {
        this.fCanvasComponent.centerGroupOrNode(node.id, true);
    }

    // Add this method to handle double-click on nodes from search
    public onNodeDoubleClickAndZoom(data: { node: NodeModel; event: MouseEvent }): void {
        // Get the position to zoom around (the node position)
        const position = {
            x: data.node.position.x,
            y: data.node.position.y,
        };

        // First center on the node to ensure we're zooming on the right area
        this.fCanvasComponent.centerGroupOrNode(data.node.id, false);

        this.fZoomDirective.setZoom(position, 1, EFZoomDirection.ZOOM_IN, true);
    }

    public toggleShowVariables(): void {
        this.showVariables.set(!this.showVariables());
    }
    public updateMouseTrackerPosition(event: IPoint): void {
        this.mouseCursorPosition = event;
    }
    public onDomainClick(): void {
        const startNodeInitialState = this.flowService.startNodeInitialState();

        const dialogRef = this.dialog.open(DomainDialogComponent, {
            width: '1000px',
            height: '800px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            panelClass: 'domain-dialog-panel',
            backdropClass: 'domain-dialog-backdrop',
            data: {
                initialData: startNodeInitialState,
            },
        });

        dialogRef.closed.subscribe((result: unknown) => {
            if (result !== null && typeof result === 'object' && result !== undefined) {
                this.updateStartNodeInitialState(result as Record<string, unknown>);
            }
        });
    }

    public onProjectExpandToggled(project: ProjectNodeModel): void {
        const dialogRef = this.dialog.open(ProjectDialogComponent, {
            width: '90vw',
            height: '90vh',

            data: {
                projectId: project.data.id,
                projectName: project.data.name,
            },
        });

        dialogRef.closed.subscribe(() => {});
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    public onOpenShortcuts(anchorEl: HTMLElement): void {
        this.openShortcuts.emit(anchorEl.getBoundingClientRect());
    }

    private isDialogOpen(): boolean {
        return this.dialog.openDialogs.length > 0;
    }

    private updateStartNodeInitialState(newState: Record<string, unknown>): void {
        const startNode = this.flowService.nodes().find((node) => node.type === NodeType.START) as
            | StartNodeModel
            | undefined;

        if (startNode) {
            const updatedStartNode: StartNodeModel = {
                ...startNode,
                data: {
                    ...startNode.data,
                    initialState: newState,
                },
            };

            this.flowService.updateNode(updatedStartNode);
        } else {
            this.toastService.error('Start node not found');
        }
    }

    private openNodePanel(nodeId: string): void {
        this.sidePanelService.setSelectedNodeId(nodeId);
        afterNextRender(() => this.nodePanelShell?.expandPanel(), { injector: this.injector });
    }
    private toFlowPosition(point: IPoint): IPoint {
        return this.fFlowComponent.getPositionInFlow(PointExtensions.initialize(point.x, point.y));
    }

    private deleteSelections(selections: ICurrentSelection): void {
        if (!selections || (selections.fNodeIds.length === 0 && selections.fConnectionIds.length === 0)) {
            console.warn('No items selected to delete.');
            return;
        }

        this.undoRedoService.stateChanged();

        const nodeIdsToDelete = selections.fNodeIds.filter((nodeId) => {
            const node = this.flowService.nodes().find((n) => n.id === nodeId);
            return node && node.type !== NodeType.START;
        });

        this.flowService.deleteSelections({
            fNodeIds: nodeIdsToDelete,
            fConnectionIds: selections.fConnectionIds,
        });
    }
    // TODO: take a look on how it worked.
    public onDragStarted(event: FDragStartedEvent): void {
        this.isDragging = true;
        this.draggingElements.clear();

        const data = event.data as FDragNodeStartEventData | undefined;
        if (data?.fNodeIds) {
            data.fNodeIds.forEach((id: string) => this.draggingElements.add(id));
        }

        this.undoRedoService.stateChanged();
    }

    public onDragEnded(): void {
        const draggedNodeIds = new Set(this.draggedNodeIds);

        this.draggedNodeIds.clear();
        this.isDragging = false;
        this.draggingElements.clear();

        this.runAfterFlowSettles(() => {
            this.applyDraggedNodePositions(draggedNodeIds);
        });
    }

    public onNodePositionChanged(newPos: IPoint, node: NodeModel): void {
        this.draggedNodeIds.add(node.id);

        if (!this.isDragging || !this.draggingElements.has(node.id)) {
            this.undoRedoService.stateChanged();
            this.flowService.updateNode({ ...node, position: snapPointToGrid(newPos) });
            this.runAfterFlowSettles(() => this.redrawFlow());
        }
    }

    private applyDraggedNodePositions(draggedNodeIds: Set<string>): void {
        const currentNodes = this.flowService.nodes();
        const runtimeState = this.fFlowComponent.getState() as {
            nodes?: Array<{ id: string; position: IPoint }>;
        };
        const runtimePositions = new Map(
            (runtimeState.nodes ?? []).map((node) => [node.id, snapPointToGrid(node.position)] as const)
        );
        const updatedNodes = resolveDraggedNodePositions(currentNodes, draggedNodeIds, runtimePositions);

        if (updatedNodes.length > 0) {
            this.flowService.updateNodesInBatch(updatedNodes);
        }

        this.redrawFlow();
    }

    private runAfterFlowSettles(callback: () => void): void {
        afterNextRender(
            () => {
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        callback();
                    });
                }, 100);
            },
            { injector: this.injector }
        );
    }

    private redrawFlow(): void {
        this.fCanvasComponent?.redraw();
        this.fFlowComponent?.redraw();
    }

    private resolveTableOverlaps(node: NodeModel): void {
        if (node.type !== NodeType.TABLE) return;

        const movedNodes = resolveOverlapsForNode(node.id, this.flowService.nodes());
        if (movedNodes.length > 0) {
            this.flowService.updateNodesInBatch(movedNodes);
        }
    }
}
