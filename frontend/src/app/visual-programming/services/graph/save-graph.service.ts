import { Injectable } from '@angular/core';
import { forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { FlowsApiService } from '../../../features/flows/services/flows-api.service';
import { GraphDto, UpdateGraphDtoRequest } from '../../../features/flows/models/graph.model';
import { FlowModel } from '../../core/models/flow.model';
import { ToastService } from '../../../services/notifications/toast.service';

import { ConditionalEdgeService } from '../../../pages/flows-page/components/flow-visual-programming/services/conditional-edge.service';
import { CrewNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/crew-node.service';
import { EdgeService } from '../../../pages/flows-page/components/flow-visual-programming/services/edge.service';
import { LLMNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/llm-node.service';
import { PythonNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/python-node.service';
import { FileExtractorService } from '../../../pages/flows-page/components/flow-visual-programming/services/file-extractor.service';
import { AudioToTextService } from '../../../pages/flows-page/components/flow-visual-programming/services/audio-to-text-node';
import { WebhookTriggerNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/webhook-trigger.service';
import { TelegramTriggerNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/telegram-trigger-node.service';
import { EndNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/end-node.service';
import { SubGraphNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/subgraph-node.service';
import { DecisionTableNodeService } from '../../../pages/flows-page/components/flow-visual-programming/services/decision-table-node.service';

import { NodeType } from '../../core/enums/node-type';
import { NodeDiff, GraphDiff } from './save-graph.types';
import {
    extractPreviousState,
    extractNewState,
    getGraphDiff,
    buildCrewPayload,
    buildPythonPayload,
    buildLLMPayload,
    buildFileExtractorPayload,
    buildAudioToTextPayload,
    buildSubGraphPayload,
    buildWebhookPayload,
    buildTelegramPayload,
    buildCondEdgePayload,
    buildEdgePayload,
    buildEndNodePayload,
    buildDecisionTablePayload,
} from './save-graph.diff';

@Injectable({
    providedIn: 'root',
})
export class GraphUpdateService {
    constructor(
        private crewNodeService: CrewNodeService,
        private pythonNodeService: PythonNodeService,
        private conditionalEdgeService: ConditionalEdgeService,
        private edgeService: EdgeService,
        private graphService: FlowsApiService,
        private llmNodeService: LLMNodeService,
        private fileExtractorService: FileExtractorService,
        private audioToTextService: AudioToTextService,
        private webhookTriggerService: WebhookTriggerNodeService,
        private telegramTriggerService: TelegramTriggerNodeService,
        private endNodeService: EndNodeService,
        private subGraphNodeService: SubGraphNodeService,
        private decisionTableNodeService: DecisionTableNodeService,
        private toastService: ToastService
    ) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers — RxJS execution of diff operations
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Executes delete / create / update operations from a diff in parallel.
     * @param diff - The diff result containing nodes to delete, create, and update
     * @param deleteOperation - Function that performs HTTP DELETE for a backend node
     * @param createOperation - Function that performs HTTP POST for a UI node
     * @param updateOperation - Function that performs HTTP PUT for a UI node (takes backendId + UI node)
     */
    private executeNodeDiff<TBackend extends { id: number }, TUI>(
        diff: NodeDiff<TBackend, TUI>,
        deleteOperation: (node: TBackend) => Observable<any>,
        createOperation: (node: TUI) => Observable<any>,
        updateOperation: (backendId: number, node: TUI) => Observable<any>
    ): Observable<any[]> {
        const operations: Observable<any>[] = [
            ...diff.toDelete.map(n => deleteOperation(n).pipe(catchError(err => throwError(() => err)))),
            ...diff.toCreate.map(n => createOperation(n).pipe(catchError(err => throwError(() => err)))),
            ...diff.toUpdate.map(({ backend, ui }) =>
                updateOperation(backend.id, ui).pipe(catchError(err => throwError(() => err)))
            ),
        ];
        return operations.length ? forkJoin(operations) : of([]);
    }

    private applyEdgeDiff(
        diff: GraphDiff['edges'],
        graphId: number
    ): Observable<any[]> {
        const ops: Observable<any>[] = [
            ...diff.toDelete.map(e =>
                this.edgeService.deleteEdge(e.id).pipe(catchError(err => throwError(() => err)))
            ),
            ...diff.toCreate.map(e =>
                this.edgeService.createEdge(buildEdgePayload(e, graphId))
                    .pipe(catchError(err => throwError(() => err)))
            ),
        ];
        return ops.length ? forkJoin(ops) : of([]);
    }


    /**
     * Extracts only UI-only elements (groups, notes, and their connections)
     * for storage in `graph.metadata`.  Backend-managed nodes and their
     * connections are persisted in their own tables.
     */
    private buildGraphMetadata(flowState: FlowModel): FlowModel {
        // Collect groups and notes (UI-only node types)
        const noteNodes = flowState.nodes
            .filter(n => n.type === NodeType.NOTE)
            .map(n => ({ ...n, ports: null }));

        const groups = flowState.groups.map(g => ({ ...g, ports: null }));

        // IDs of UI-only nodes (notes + groups)
        const uiOnlyIds = new Set<string>([
            ...noteNodes.map(n => n.id),
            ...groups.map(g => g.id),
        ]);

        // Only keep connections that involve at least one UI-only node
        const uiOnlyConnections = flowState.connections.filter(
            c => uiOnlyIds.has(c.sourceNodeId) || uiOnlyIds.has(c.targetNodeId)
        );

        return {
            nodes: noteNodes,
            connections: uiOnlyConnections,
            groups,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    public saveGraph(
        flowState: FlowModel,
        graph: GraphDto
    ): Observable<{
        graph: GraphDto;
        updatedNodes: Record<string, any[]>;
    }> {
        console.log('GraphUpdateService: Saving graph:', graph);
        console.log('GraphUpdateService: Flow state:', flowState);

        // ── 1. Extract what is currently saved in the backend ────────────────
        const previousState = extractPreviousState(graph);

        // ── 2. Extract what the user currently has in the UI ─────────────────
        const newState = extractNewState(flowState);

        // ── 3. Get the diff (pure, no side effects) ───────────────────────────
        console.log('[GraphUpdateService] Computing diff...');
        console.log('[GraphUpdateService] Previous state counts:', {
            crew: previousState.crewNodes.length,
            python: previousState.pythonNodes.length,
            llm: previousState.llmNodes.length,
            fileExtractor: previousState.fileExtractorNodes.length,
            audioToText: previousState.audioToTextNodes.length,
            subGraph: previousState.subGraphNodes.length,
            webhook: previousState.webhookTriggerNodes.length,
            telegram: previousState.telegramTriggerNodes.length,
            conditionalEdges: previousState.conditionalEdges.length,
            edges: previousState.edges.length,
            endNodes: previousState.endNodes.length,
            decisionTable: previousState.decisionTableNodes.length,
        });
        console.log('[GraphUpdateService] New state counts:', {
            crew: newState.crewNodes.length,
            python: newState.pythonNodes.length,
            llm: newState.llmNodes.length,
            fileExtractor: newState.fileExtractorNodes.length,
            audioToText: newState.audioToTextNodes.length,
            subGraph: newState.subGraphNodes.length,
            webhook: newState.webhookTriggerNodes.length,
            telegram: newState.telegramTriggerNodes.length,
            conditionalEdges: newState.conditionalEdges.length,
            edges: newState.edges.length,
            endNodes: newState.endNodes.length,
            decisionTable: newState.decisionTableNodes.length,
        });

        const diff = getGraphDiff(previousState, newState);

        console.log('[GraphUpdateService] Diff result:', {
            crew: `${diff.crewNodes.toDelete.length}D/${diff.crewNodes.toCreate.length}C/${diff.crewNodes.toUpdate.length}U`,
            python: `${diff.pythonNodes.toDelete.length}D/${diff.pythonNodes.toCreate.length}C/${diff.pythonNodes.toUpdate.length}U`,
            llm: `${diff.llmNodes.toDelete.length}D/${diff.llmNodes.toCreate.length}C/${diff.llmNodes.toUpdate.length}U`,
            fileExtractor: `${diff.fileExtractorNodes.toDelete.length}D/${diff.fileExtractorNodes.toCreate.length}C/${diff.fileExtractorNodes.toUpdate.length}U`,
            audioToText: `${diff.audioToTextNodes.toDelete.length}D/${diff.audioToTextNodes.toCreate.length}C/${diff.audioToTextNodes.toUpdate.length}U`,
            subGraph: `${diff.subGraphNodes.toDelete.length}D/${diff.subGraphNodes.toCreate.length}C/${diff.subGraphNodes.toUpdate.length}U`,
            webhook: `${diff.webhookTriggerNodes.toDelete.length}D/${diff.webhookTriggerNodes.toCreate.length}C/${diff.webhookTriggerNodes.toUpdate.length}U`,
            telegram: `${diff.telegramTriggerNodes.toDelete.length}D/${diff.telegramTriggerNodes.toCreate.length}C/${diff.telegramTriggerNodes.toUpdate.length}U`,
            conditionalEdges: `${diff.conditionalEdges.toDelete.length}D/${diff.conditionalEdges.toCreate.length}C/${diff.conditionalEdges.toUpdate.length}U`,
            edges: `${diff.edges.toDelete.length}D/${diff.edges.toCreate.length}C`,
            endNodes: `${diff.endNodes.toDelete.length}D/${diff.endNodes.toCreate.length}C/${diff.endNodes.toUpdate.length}U`,
            decisionTable: `${diff.decisionTableNodes.toDelete.length}D/${diff.decisionTableNodes.toCreate.length}C/${diff.decisionTableNodes.toUpdate.length}U`,
        });

        const { id: graphId } = graph;
        const allNodes = newState.allNodes;

        // ── 4. Apply the diff — send only what changed to the backend ─────────
        return forkJoin({
            crewNodes: this.executeNodeDiff(
                diff.crewNodes,
                n => this.crewNodeService.deleteCrewNode(n.id.toString()),
                n => this.crewNodeService.createCrewNode(buildCrewPayload(n, graphId, allNodes)),
                (id, n) => this.crewNodeService.updateCrewNode(id, buildCrewPayload(n, graphId, allNodes))
            ),
            pythonNodes: this.executeNodeDiff(
                diff.pythonNodes,
                n => this.pythonNodeService.deletePythonNode(n.id.toString()),
                n => this.pythonNodeService.createPythonNode(buildPythonPayload(n, graphId, allNodes)),
                (id, n) => this.pythonNodeService.updatePythonNode(id, buildPythonPayload(n, graphId, allNodes))
            ),
            llmNodes: this.executeNodeDiff(
                diff.llmNodes,
                n => this.llmNodeService.deleteLLMNode(n.id.toString()),
                n => this.llmNodeService.createLLMNode(buildLLMPayload(n, graphId, allNodes)),
                (id, n) => this.llmNodeService.updateLLMNode(id, buildLLMPayload(n, graphId, allNodes))
            ),
            fileExtractorNodes: this.executeNodeDiff(
                diff.fileExtractorNodes,
                n => this.fileExtractorService.deleteFileExtractorNode(n.id.toString()),
                n => this.fileExtractorService.createFileExtractorNode(buildFileExtractorPayload(n, graphId, allNodes)),
                (id, n) => this.fileExtractorService.updateFileExtractorNode(id, buildFileExtractorPayload(n, graphId, allNodes))
            ),
            audioToTextNodes: this.executeNodeDiff(
                diff.audioToTextNodes,
                n => this.audioToTextService.deleteAudioToTextNode(n.id.toString()),
                n => this.audioToTextService.createAudioToTextNode(buildAudioToTextPayload(n, graphId, allNodes)),
                (id, n) => this.audioToTextService.updateAudioToTextNode(id, buildAudioToTextPayload(n, graphId, allNodes))
            ),
            subGraphNodes: this.executeNodeDiff(
                diff.subGraphNodes,
                n => this.subGraphNodeService.deleteSubGraphNode(n.id),
                n => this.subGraphNodeService.createSubGraphNode(buildSubGraphPayload(n, graphId, allNodes)),
                (id, n) => this.subGraphNodeService.updateSubGraphNode(id, buildSubGraphPayload(n, graphId, allNodes))
            ),
            webhookTriggerNodes: this.executeNodeDiff(
                diff.webhookTriggerNodes,
                n => this.webhookTriggerService.deleteWebhookTriggerNode(n.id.toString()),
                n => this.webhookTriggerService.createWebhookTriggerNode(buildWebhookPayload(n, graphId, allNodes)),
                (id, n) => this.webhookTriggerService.updateWebhookTriggerNode(id, buildWebhookPayload(n, graphId, allNodes))
            ),
            telegramTriggerNodes: this.executeNodeDiff(
                diff.telegramTriggerNodes,
                n => this.telegramTriggerService.deleteTelegramTriggerNode(n.id),
                n => this.telegramTriggerService.createTelegramTriggerNode(buildTelegramPayload(n, graphId, allNodes)),
                (id, n) => this.telegramTriggerService.updateTelegramTriggerNode(id, buildTelegramPayload(n, graphId, allNodes))
            ),
            conditionalEdges: this.executeNodeDiff(
                diff.conditionalEdges,
                n => this.conditionalEdgeService.deleteConditionalEdge(n.id),
                n => this.conditionalEdgeService.createConditionalEdge(buildCondEdgePayload(n, graphId, allNodes)),
                (id, n) => this.conditionalEdgeService.updateConditionalEdge(id, buildCondEdgePayload(n, graphId, allNodes))
            ),
            decisionTableNodes: this.executeNodeDiff(
                diff.decisionTableNodes,
                n => this.decisionTableNodeService.deleteDecisionTableNode(n.id.toString()),
                n => this.decisionTableNodeService.createDecisionTableNode(buildDecisionTablePayload(n, graphId, allNodes)),
                (id, n) => this.decisionTableNodeService.updateDecisionTableNode(id, buildDecisionTablePayload(n, graphId, allNodes))
            ),
            edges: this.applyEdgeDiff(diff.edges, graphId),
            endNodes: this.executeNodeDiff(
                diff.endNodes,
                n => this.endNodeService.deleteEndNode(n.id),
                n => this.endNodeService.createEndNode(buildEndNodePayload(n, graphId, allNodes)),
                (id, n) => this.endNodeService.updateEndNode(id, buildEndNodePayload(n, graphId, allNodes))
            ),
        }).pipe(
            // ── 5. After all nodes are synced, update the graph metadata ──────
            switchMap(results => {
                const updateRequest: UpdateGraphDtoRequest = {
                    id: graph.id,
                    name: graph.name,
                    description: graph.description,
                    metadata: this.buildGraphMetadata(flowState),
                };

                console.log('GraphUpdateService: Sending graph metadata update', updateRequest);

                return this.graphService.updateGraph(graph.id, updateRequest).pipe(
                    map(updatedGraph => {
                        console.log('GraphUpdateService: Graph saved successfully', updatedGraph);
                        return { graph: updatedGraph, updatedNodes: results };
                    })
                );
            }),
            catchError(err => throwError(() => err))
        );
    }
}
