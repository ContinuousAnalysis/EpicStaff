import {Injectable} from '@angular/core';
import {forkJoin, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';

import {FlowsApiService} from '../../../features/flows/services/flows-api.service';
import {GetProjectRequest} from '../../../features/projects/models/project.model';
import {NodeType} from '../../core/enums/node-type';
import {ConnectionModel} from '../../core/models/connection.model';
import {FlowModel} from '../../core/models/flow.model';
import {ClassificationDecisionTableNodeModel, EdgeNodeModel, LLMNodeModel, ProjectNodeModel, PythonNodeModel,} from '../../core/models/node.model';

import {ToastService} from '../../../services/notifications/toast.service';
import {
    ConditionalEdgeService
} from '../../../pages/flows-page/components/flow-visual-programming/services/conditional-edge.service';
import {
    CrewNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/crew-node.model';
import {Edge} from '../../../pages/flows-page/components/flow-visual-programming/models/edge.model';
import {
    PythonNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/python-node.model';
import {CrewNodeService} from '../../../pages/flows-page/components/flow-visual-programming/services/crew-node.service';
import {EdgeService} from '../../../pages/flows-page/components/flow-visual-programming/services/edge.service';
import {LLMNodeService} from '../../../pages/flows-page/components/flow-visual-programming/services/llm-node.service';
import {
    PythonNodeService
} from '../../../pages/flows-page/components/flow-visual-programming/services/python-node.service';
import {
    FileExtractorService
} from '../../../pages/flows-page/components/flow-visual-programming/services/file-extractor.service';
import {GraphDto, UpdateGraphDtoRequest,} from '../../../features/flows/models/graph.model';
import {
    EndNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/end-node.model';
import {EndNodeService} from '../../../pages/flows-page/components/flow-visual-programming/services/end-node.service';
import {
    AudioToTextService
} from '../../../pages/flows-page/components/flow-visual-programming/services/audio-to-text-node';
import {
    WebhookTriggerNodeService
} from '../../../pages/flows-page/components/flow-visual-programming/services/webhook-trigger.service';
import {
    CreateConditionGroupRequest,
    GetDecisionTableNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/decision-table-node.model';
import {
    DecisionTableNodeService
} from '../../../pages/flows-page/components/flow-visual-programming/services/decision-table-node.service';
import {
    TelegramTriggerNodeService
} from "../../../pages/flows-page/components/flow-visual-programming/services/telegram-trigger-node.service";
import {
    ClassificationDecisionTableNodeService
} from '../../../pages/flows-page/components/flow-visual-programming/services/classification-decision-table-node.service';

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
        private decisionTableNodeService: DecisionTableNodeService,
        private classificationDecisionTableNodeService: ClassificationDecisionTableNodeService,
        private toastService: ToastService
    ) { }

    /**
     * Clears all ports on nodes to null before saving
     * This reduces the metadata size and prevents storing unnecessary port data
     */
    private clearNodePorts(flowState: FlowModel): FlowModel {
        const preservePortTypes = new Set([
            NodeType.TABLE,
            NodeType.CLASSIFICATION_TABLE,
        ]);
        const flowStateCopy: FlowModel = {
            ...flowState,
            nodes: flowState.nodes.map((node) => ({
                ...node,
                ports: preservePortTypes.has(node.type as NodeType)
                    ? node.ports
                    : null,
            })),
            connections: [...flowState.connections],
            groups: [...flowState.groups],
        };

        return flowStateCopy;
    }

    private resolveNodeName(flowState: FlowModel, idOrName: string | null): string | null {
        if (!idOrName) return null;
        const targetNode = flowState.nodes.find((n) => n.id === idOrName);
        return targetNode ? targetNode.node_name : idOrName;
    }

    private deleteAndRecreate<TExisting extends { id: number | string }, TCreated>(
        existingList: TExisting[] | undefined,
        deleteFn: (item: TExisting) => Observable<any>,
        createFn: () => Observable<TCreated>[],
    ): Observable<TCreated[]> {
        let delete$: Observable<any> = of(null);
        if (existingList && existingList.length > 0) {
            delete$ = forkJoin(existingList.map(deleteFn));
        }
        return delete$.pipe(
            switchMap(() => {
                const requests = createFn();
                return requests.length ? forkJoin(requests) : of([]);
            })
        );
    }

    public saveGraph(
        flowState: FlowModel,
        graph: GraphDto
    ): Observable<{
        graph: GraphDto;
        updatedNodes: {
            crewNodes: CrewNode[];
            pythonNodes: PythonNode[];
            audioToTextNodes: any[];
            llmNodes: any[];
            fileExtractorNodes: any[];
            webhookTriggerNodes: any[];
            telegramTriggerNodes: any[];
            conditionalEdges: any[];
            edges: Edge[];
            endNodes: EndNode[];
            decisionTableNodes: GetDecisionTableNodeRequest[];
        };
    }> {
        const flowStateWithoutPorts = this.clearNodePorts(flowState);
        const nodeById = new Map(flowState.nodes.map((n) => [n.id, n]));

        const crewNodes$ = this.deleteAndRecreate(
            graph.crew_node_list,
            (node) => this.crewNodeService.deleteCrewNode(node.id.toString()),
            () => (flowState.nodes.filter((n) => n.type === NodeType.PROJECT) as ProjectNodeModel[])
                .map((node) => this.crewNodeService.createCrewNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    crew_id: (node.data as GetProjectRequest).id,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path || null,
                }))
        );

        const pythonNodes$ = this.deleteAndRecreate(
            graph.python_node_list,
            (node) => this.pythonNodeService.deletePythonNode(node.id.toString()),
            () => (flowState.nodes.filter((n) => n.type === NodeType.PYTHON) as PythonNodeModel[])
                .map((node) => this.pythonNodeService.createPythonNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    python_code: node.data,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path || null,
                }))
        );

        const fileExtractorNodes$ = this.deleteAndRecreate(
            graph.file_extractor_node_list,
            (node) => this.fileExtractorService.deleteFileExtractorNode(node.id.toString()),
            () => flowState.nodes.filter((n) => n.type === NodeType.FILE_EXTRACTOR)
                .map((node) => this.fileExtractorService.createFileExtractorNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path || null,
                }))
        );

        const audioToTextNodes$ = this.deleteAndRecreate(
            graph.audio_transcription_node_list,
            (node) => this.audioToTextService.deleteAudioToTextNode(node.id.toString()),
            () => flowState.nodes.filter((n) => n.type === NodeType.AUDIO_TO_TEXT)
                .map((node) => this.audioToTextService.createAudioToTextNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path || null,
                }))
        );

        const llmNodes$ = this.deleteAndRecreate(
            graph.llm_node_list,
            (node) => this.llmNodeService.deleteLLMNode(node.id.toString()),
            () => (flowState.nodes.filter((n) => n.type === NodeType.LLM) as LLMNodeModel[])
                .map((node) => this.llmNodeService.createLLMNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    llm_config: node.data.id,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path || null,
                }))
        );

        const endNodes$ = this.deleteAndRecreate(
            graph.end_node_list,
            (node) => this.endNodeService.deleteEndNode(node.id),
            () => flowState.nodes.filter((n) => n.type === NodeType.END)
                .map((node) => this.endNodeService.createEndNode({
                    graph: graph.id,
                    output_map: (node as any).data?.output_map || {
                        context: 'variables.context',
                    },
                }))
        );

        const webhookTriggerNodes$ = this.deleteAndRecreate(
            graph.webhook_trigger_node_list,
            (node) => this.webhookTriggerService.deleteWebhookTriggerNode(node.id.toString()),
            () => flowState.nodes.filter((n) => n.type === NodeType.WEBHOOK_TRIGGER)
                .map((node) => this.webhookTriggerService.createWebhookTriggerNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    python_code: node.data.python_code,
                    input_map: node.input_map || {},
                    output_variable_path: node.output_variable_path,
                    webhook_trigger_path: node.data.webhook_trigger_path,
                }))
        );

        const telegramTriggerNodes$ = this.deleteAndRecreate(
            graph.telegram_trigger_node_list,
            (node) => this.telegramTriggerService.deleteTelegramTriggerNode(node.id),
            () => flowState.nodes.filter((n) => n.type === NodeType.TELEGRAM_TRIGGER)
                .map((node) => this.telegramTriggerService.createTelegramTriggerNode({
                    node_name: node.node_name,
                    graph: graph.id,
                    telegram_bot_api_key: node.data.telegram_bot_api_key,
                    fields: node.data.fields,
                }))
        );

        const conditionalEdges$ = this.deleteAndRecreate(
            graph.conditional_edge_list,
            (edge) => this.conditionalEdgeService.deleteConditionalEdge(edge.id),
            () => {
                const edgeNodes = flowState.nodes.filter(
                    (node) => node.type === NodeType.EDGE
                ) as EdgeNodeModel[];
                return edgeNodes
                    .filter((edgeNode) => {
                        const conn = flowState.connections.find(
                            (c) => c.targetNodeId === edgeNode.id
                        );
                        return conn && nodeById.has(conn.sourceNodeId);
                    })
                    .map((edgeNode) => {
                        const conn = flowState.connections.find(
                            (c) => c.targetNodeId === edgeNode.id
                        )!;
                        const sourceNode = nodeById.get(conn.sourceNodeId);
                        return this.conditionalEdgeService.createConditionalEdge({
                            graph: graph.id,
                            source: sourceNode ? sourceNode.node_name : null,
                            then: null,
                            python_code: edgeNode.data.python_code,
                            input_map: edgeNode.input_map || {},
                        });
                    });
            }
        );

        const edges$ = this.deleteAndRecreate(
            graph.edge_list,
            (edge) => this.edgeService.deleteEdge(edge.id),
            () => {
                const skipSourceTypes = new Set([
                    NodeType.EDGE, NodeType.TABLE, NodeType.CLASSIFICATION_TABLE,
                ]);
                const edgeRequests = flowState.connections
                    .filter((conn: ConnectionModel) => {
                        const sourceNode = nodeById.get(conn.sourceNodeId);
                        const targetNode = nodeById.get(conn.targetNodeId);
                        if (!sourceNode || !targetNode) return false;
                        if (skipSourceTypes.has(sourceNode.type as NodeType)) return false;
                        if (targetNode.type === NodeType.EDGE) return false;
                        return true;
                    })
                    .map((conn) => this.edgeService.createEdge({
                        start_key: nodeById.get(conn.sourceNodeId)!.node_name,
                        end_key: nodeById.get(conn.targetNodeId)!.node_name,
                        graph: graph.id,
                    }));

                // Add edges to __end__ for terminal nodes (no outgoing connections)
                const nodesWithOutgoing = new Set(
                    flowState.connections.map((c: ConnectionModel) => c.sourceNodeId)
                );
                const terminalSkipTypes = new Set([
                    NodeType.END, NodeType.START, NodeType.EDGE,
                    NodeType.TABLE, NodeType.CLASSIFICATION_TABLE,
                    NodeType.WEBHOOK_TRIGGER, NodeType.TELEGRAM_TRIGGER,
                    NodeType.NOTE,
                ]);
                const endNode = flowState.nodes.find((n) => n.type === NodeType.END);
                const endKey = endNode ? endNode.node_name : '__end__';
                flowState.nodes
                    .filter((n) => !nodesWithOutgoing.has(n.id) && !terminalSkipTypes.has(n.type as NodeType))
                    .forEach((n) => {
                        edgeRequests.push(
                            this.edgeService.createEdge({
                                start_key: n.node_name,
                                end_key: endKey,
                                graph: graph.id,
                            })
                        );
                    });

                return edgeRequests;
            }
        );

        const decisionTableNodes$ = this.deleteAndRecreate(
            graph.decision_table_node_list,
            (node) => this.decisionTableNodeService.deleteDecisionTableNode(node.id.toString()),
            () => flowState.nodes.filter((n) => n.type === NodeType.TABLE)
                .map((node) => {
                    const tableData = (node as any).data?.table;
                    const conditionGroups: CreateConditionGroupRequest[] = (
                        tableData?.condition_groups || []
                    )
                        .filter((group: any) => group.valid !== false)
                        .sort(
                            (a: any, b: any) =>
                                (a.order ?? Number.MAX_SAFE_INTEGER) -
                                (b.order ?? Number.MAX_SAFE_INTEGER)
                        )
                        .map((group: any, index: number) => ({
                            group_name: group.group_name,
                            group_type: group.group_type || 'complex',
                            expression: group.expression,
                            conditions: (group.conditions || []).map(
                                (condition: any) => ({
                                    condition_name: condition.condition_name,
                                    condition: condition.condition,
                                })
                            ),
                            manipulation: group.manipulation,
                            next_node: this.resolveNodeName(flowState, group.next_node),
                            order: typeof group.order === 'number' ? group.order : index + 1,
                        }));

                    return this.decisionTableNodeService.createDecisionTableNode({
                        graph: graph.id,
                        node_name: node.node_name,
                        condition_groups: conditionGroups,
                        default_next_node: this.resolveNodeName(flowState, tableData?.default_next_node),
                        next_error_node: this.resolveNodeName(flowState, tableData?.next_error_node),
                    });
                })
        );

        const classificationDTNodes$ = this.deleteAndRecreate(
            graph.classification_decision_table_node_list,
            (node) => this.classificationDecisionTableNodeService.deleteNode(node.id.toString()),
            () => (flowState.nodes.filter((n) => n.type === NodeType.CLASSIFICATION_TABLE) as ClassificationDecisionTableNodeModel[])
                .map((node) => {
                    const payload = this.classificationDecisionTableNodeService
                        .buildCreatePayload(
                            graph.id,
                            node,
                            (idOrName) => this.resolveNodeName(flowState, idOrName)
                        );
                    return this.classificationDecisionTableNodeService.createNode(payload);
                })
        );

        // ---- Combine and Update Graph ----
        return forkJoin({
            crewNodes: crewNodes$,
            pythonNodes: pythonNodes$,
            audioToTextNodes: audioToTextNodes$,
            llmNodes: llmNodes$,
            fileExtractorNodes: fileExtractorNodes$,
            webhookTriggerNodes: webhookTriggerNodes$,
            telegramTriggerNodes: telegramTriggerNodes$,
            conditionalEdges: conditionalEdges$,
            endNodes: endNodes$,
            edges: edges$,
            decisionTableNodes: decisionTableNodes$,
            classificationDTNodes: classificationDTNodes$,
        }).pipe(
            switchMap((results) => {
                const updateGraphRequest: UpdateGraphDtoRequest = {
                    id: graph.id,
                    name: graph.name,
                    description: graph.description,
                    metadata: flowStateWithoutPorts,
                };

                return this.graphService
                    .updateGraph(graph.id, updateGraphRequest)
                    .pipe(
                        map((updatedGraph) => ({
                            graph: updatedGraph,
                            updatedNodes: {
                                crewNodes: results.crewNodes,
                                pythonNodes: results.pythonNodes,
                                audioToTextNodes: results.audioToTextNodes,
                                llmNodes: results.llmNodes,
                                fileExtractorNodes: results.fileExtractorNodes,
                                conditionalEdges: results.conditionalEdges,
                                webhookTriggerNodes: results.webhookTriggerNodes,
                                telegramTriggerNodes: results.telegramTriggerNodes,
                                edges: results.edges,
                                endNodes: results.endNodes,
                                decisionTableNodes: results.decisionTableNodes,
                            },
                        }))
                    );
            })
        );
    }
}
