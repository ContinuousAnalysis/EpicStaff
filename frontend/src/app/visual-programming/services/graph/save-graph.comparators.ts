/**
 * Comparison functions — extract only the fields that should be compared
 * when determining if a node has changed.
 *
 * Each node type has two functions:
 *   - getXxxForComparisonFromBackend — extracts comparable fields from backend model
 *   - getXxxForComparisonFromUI       — extracts comparable fields from UI model
 */

import { GetProjectRequest } from '../../../features/projects/models/project.model';
import {
    CrewNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/crew-node.model';
import {
    PythonNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/python-node.model';
import {
    GetLLMNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/llm-node.model';
import {
    GetFileExtractorNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/file-extractor.model';
import {
    GetAudioToTextNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/audio-to-text.model';
import {
    SubGraphNode,
} from '../../../pages/flows-page/components/flow-visual-programming/models/subgraph-node.model';
import {
    GetWebhookTriggerNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/webhook-trigger';
import {
    GetTelegramTriggerNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/telegram-trigger.model';
import {
    ConditionalEdge,
} from '../../../pages/flows-page/components/flow-visual-programming/models/conditional-edge.model';
import {
    GetDecisionTableNodeRequest,
} from '../../../pages/flows-page/components/flow-visual-programming/models/decision-table-node.model';
import {
    ProjectNodeModel,
    PythonNodeModel,
    LLMNodeModel,
    FileExtractorNodeModel,
    AudioToTextNodeModel,
    SubGraphNodeModel,
    WebhookTriggerNodeModel,
    TelegramTriggerNodeModel,
    EdgeNodeModel,
    NodeModel,
} from '../../core/models/node.model';
import { ResolvedConditionalEdge } from './save-graph.types';
import { EndNode } from '../../../pages/flows-page/components/flow-visual-programming/models/end-node.model';
import { EndNodeModel } from '../../core/models/node.model';

// ─────────────────────────────────────────────────────────────────────────────
// CrewNode (ProjectNodeModel)
// ─────────────────────────────────────────────────────────────────────────────

export function getCrewNodeForComparisonFromBackend(node: CrewNode) {
    return {
        crew_id: node.crew.id,
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getCrewNodeForComparisonFromUI(node: ProjectNodeModel) {
    return {
        crew_id: (node.data as GetProjectRequest).id,
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PythonNode
// ─────────────────────────────────────────────────────────────────────────────

export function getPythonNodeForComparisonFromBackend(node: PythonNode) {
    return {
        libraries: node.python_code.libraries,
        code: (node.python_code.code || '').trimEnd(),
        entrypoint: node.python_code.entrypoint,
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getPythonNodeForComparisonFromUI(node: PythonNodeModel) {
    return {
        libraries: node.data.libraries,
        code: (node.data.code || '').trimEnd(),
        entrypoint: node.data.entrypoint,
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLMNode
// ─────────────────────────────────────────────────────────────────────────────

export function getLLMNodeForComparisonFromBackend(node: GetLLMNodeRequest) {
    return {
        llm_config: node.llm_config,
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getLLMNodeForComparisonFromUI(node: LLMNodeModel) {
    return {
        llm_config: node.data.id,
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// FileExtractorNode
// ─────────────────────────────────────────────────────────────────────────────

export function getFileExtractorNodeForComparisonFromBackend(node: GetFileExtractorNodeRequest) {
    return {
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getFileExtractorNodeForComparisonFromUI(node: FileExtractorNodeModel) {
    return {
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioToTextNode
// ─────────────────────────────────────────────────────────────────────────────

export function getAudioToTextNodeForComparisonFromBackend(node: GetAudioToTextNodeRequest) {
    return {
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getAudioToTextNodeForComparisonFromUI(node: AudioToTextNodeModel) {
    return {
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SubGraphNode
// ─────────────────────────────────────────────────────────────────────────────

export function getSubGraphNodeForComparisonFromBackend(node: SubGraphNode) {
    return {
        subgraph: node.subgraph,
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
    };
}

export function getSubGraphNodeForComparisonFromUI(node: SubGraphNodeModel) {
    return {
        subgraph: node.data.id,
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebhookTriggerNode
// ─────────────────────────────────────────────────────────────────────────────

export function getWebhookTriggerNodeForComparisonFromBackend(node: GetWebhookTriggerNodeRequest) {
    return {
        libraries: node.python_code.libraries,
        code: (node.python_code.code || '').trimEnd(),
        entrypoint: node.python_code.entrypoint,
        input_map: node.input_map,
        output_variable_path: node.output_variable_path,
        webhook_trigger_path: node.webhook_trigger_path,
    };
}

export function getWebhookTriggerNodeForComparisonFromUI(node: WebhookTriggerNodeModel) {
    return {
        libraries: node.data.python_code.libraries,
        code: (node.data.python_code.code || '').trimEnd(),
        entrypoint: node.data.python_code.entrypoint,
        input_map: node.input_map || {},
        output_variable_path: node.output_variable_path || null,
        webhook_trigger_path: node.data.webhook_trigger_path,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TelegramTriggerNode
// ─────────────────────────────────────────────────────────────────────────────

export function getTelegramTriggerNodeForComparisonFromBackend(node: GetTelegramTriggerNodeRequest) {
    return {
        telegram_bot_api_key: node.telegram_bot_api_key,
        fields: node.fields,
    };
}

export function getTelegramTriggerNodeForComparisonFromUI(node: TelegramTriggerNodeModel) {
    return {
        telegram_bot_api_key: node.data.telegram_bot_api_key,
        fields: node.data.fields,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ConditionalEdge
// ─────────────────────────────────────────────────────────────────────────────

export function getConditionalEdgeForComparisonFromBackend(node: ConditionalEdge) {
    return {
        libraries: node.python_code.libraries,
        code: (node.python_code.code || '').trimEnd(),
        entrypoint: node.python_code.entrypoint,
        input_map: node.input_map,
        then: node.then,
    };
}

export function getConditionalEdgeForComparisonFromUI(node: ResolvedConditionalEdge) {
    return {
        libraries: node.edgeNode.data.python_code.libraries,
        code: (node.edgeNode.data.python_code.code || '').trimEnd(),
        entrypoint: node.edgeNode.data.python_code.entrypoint,
        input_map: node.edgeNode.input_map || {},
        then: node.targetName,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DecisionTableNode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves a node ID (UUID) or already-a-name to a node_name using the UI node list.
 */
function resolveNodeName(idOrName: string | null, allNodes: NodeModel[]): string | null {
    if (!idOrName) return null;
    const match = allNodes.find(n => n.id === idOrName);
    return match ? match.node_name : idOrName;
}

export function getDecisionTableNodeForComparisonFromBackend(node: GetDecisionTableNodeRequest) {
    return {
        condition_groups: node.condition_groups.map(g => ({
            group_name: g.group_name,
            group_type: g.group_type,
            expression: g.expression,
            conditions: g.conditions.map(c => ({
                condition_name: c.condition_name,
                condition: c.condition,
            })),
            manipulation: g.manipulation,
            next_node: g.next_node,
            order: g.order,
        })),
        default_next_node: node.default_next_node,
        next_error_node: node.next_error_node,
    };
}

export function getDecisionTableNodeForComparisonFromUI(
    node: NodeModel,
    allNodes: NodeModel[]
) {
    const tableData = (node as any).data?.table;
    const groups = ((tableData?.condition_groups ?? []) as any[])
        .filter(g => g.valid !== false)
        .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
        .map((g, idx) => ({
            group_name: g.group_name,
            group_type: g.group_type ?? 'complex',
            expression: g.expression,
            conditions: (g.conditions ?? []).map((c: any) => ({
                condition_name: c.condition_name,
                condition: c.condition,
            })),
            manipulation: g.manipulation,
            next_node: resolveNodeName(g.next_node, allNodes),
            order: typeof g.order === 'number' ? g.order : idx + 1,
        }));

    return {
        condition_groups: groups,
        default_next_node: resolveNodeName(tableData?.default_next_node, allNodes),
        next_error_node: resolveNodeName(tableData?.next_error_node, allNodes),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// EndNode
// ─────────────────────────────────────────────────────────────────────────────

export function getEndNodeForComparisonFromBackend(node: EndNode) {
    return {
        output_map: node.output_map,
    };
}

export function getEndNodeForComparisonFromUI(node: EndNodeModel) {
    return {
        output_map: (node.data as any).output_map ?? { context: 'variables.context' },
    };
}

