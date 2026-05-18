import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { ToastService } from '../../services/notifications/toast.service';
import {
    ActionItem,
    EfTable,
    EfTableColumn,
    FlowAssistantConfig,
    FlowAssistantMessage,
    SessionSummary,
    StreamDoneEvent,
    StreamEvent,
    StreamStructuredEvent,
    StreamToolCallEvent,
} from './models/flow-assistant.model';
import { FlowAssistantApiService } from './services/flow-assistant-api.service';

const PANEL_WIDTH_KEY = 'flow_assistant_panel_width';
const DEFAULT_PANEL_WIDTH = 420;

const STARTER_PROMPT_CHIPS: ActionItem[] = [
    { type: 'prompt', text: 'What do you do?' },
    { type: 'prompt', text: 'How do you handle an unusual case?' },
    { type: 'prompt', text: "What's outside your scope?" },
];

function toolStatusFor(event: StreamToolCallEvent): string {
    const a = event.arguments ?? {};
    switch (event.name) {
        case 'get_flow_overview':
            return 'Browsing the flow…';
        case 'get_node': {
            const hint = event.node_name_hint;
            return hint ? `Looking up node "${hint}"…` : `Looking up node #${a['node_id']}…`;
        }
        case 'get_subflow': {
            const hint = event.subgraph_name_hint;
            return hint ? `Inspecting subflow "${hint}"…` : `Inspecting subflow #${a['subgraph_node_id']}…`;
        }
        case 'get_edges_from': {
            const hint = event.node_name_hint;
            return hint
                ? `Checking outgoing connections from "${hint}"…`
                : `Checking outgoing connections from node #${a['node_id']}…`;
        }
        case 'get_edges_to': {
            const hint = event.node_name_hint;
            return hint
                ? `Checking incoming connections to "${hint}"…`
                : `Checking incoming connections to node #${a['node_id']}…`;
        }
        case 'list_node_types':
            return 'Surveying node types…';
        case 'list_skills':
            return 'Browsing the knowledge base…';
        case 'load_skill':
            return typeof a['name'] === 'string' ? `Reading the "${a['name']}" skill…` : 'Reading a skill…';
        case 'get_recent_sessions':
            return 'Reviewing recent runs…';
        case 'get_session_detail': {
            const sid = a['session_id'];
            return typeof sid === 'number' || (typeof sid === 'string' && sid !== '')
                ? `Looking up session ${sid}…`
                : 'Looking up a session…';
        }
        case 'get_session_stats':
            return 'Counting runs…';
        case 'get_session_messages': {
            const sid = a['session_id'];
            return typeof sid === 'number' || (typeof sid === 'string' && sid !== '')
                ? `Reading the session ${sid} trace…`
                : 'Reading a session trace…';
        }
        default:
            return 'Working…';
    }
}

/**
 * Removes GitHub-flavored markdown tables from `text`.
 * A markdown table is: a header row of pipes, a separator row like |---|---|,
 * and one or more body rows of pipes.
 *
 * This is defensive — the LLM is instructed via the system prompt to put
 * table data in `ef_tables` only, but we strip duplicate markdown tables
 * here as a safety net.
 */
function stripMarkdownTables(text: string): string {
    const lines = text.split('\n');
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
        // Detect a table: pipe-containing line, followed by a separator line.
        const header = lines[i];
        const next = lines[i + 1] ?? '';
        const isTableHeader =
            header.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(next.trim());
        if (isTableHeader) {
            // Skip the header + separator + all subsequent body rows that contain pipes.
            i += 2;
            while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
                i++;
            }
            // Also collapse any blank line immediately after the table.
            if (i < lines.length && lines[i].trim() === '') {
                i++;
            }
            continue;
        }
        out.push(header);
        i++;
    }
    return out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
}

/**
 * Defensive normalizer for ef_tables. The LLM sometimes emits rows in a
 * nested {id, columns: [{name, value}, ...]} shape instead of the spec's
 * flat {key: value} shape. We detect that case and flatten it so the
 * table component (which expects flat rows) renders correctly.
 *
 * Also tolerates column metadata using `name` instead of the spec's `key`
 * + `title` pair: `{name, type}` becomes `{key: name, title: name, type}`.
 */
function normalizeEfTable(table: EfTable): EfTable {
    const normalizedColumns = table.columns?.map((col) => {
        const raw = col as unknown as Record<string, unknown>;
        const key = (raw['key'] as string) ?? (raw['name'] as string) ?? '';
        const title = (raw['title'] as string) ?? (raw['name'] as string) ?? key;
        return {
            ...col,
            key,
            title,
        } as EfTableColumn;
    });

    const normalizedRows = table.rows.map((row) => {
        const raw = row as Record<string, unknown>;
        const nestedColumns = raw['columns'];
        // Detect the wonky shape: a `columns` array of {name, value} pairs.
        if (
            Array.isArray(nestedColumns) &&
            nestedColumns.length > 0 &&
            nestedColumns.every(
                (c) => c && typeof c === 'object' && 'name' in (c as object) && 'value' in (c as object)
            )
        ) {
            const flat: Record<string, unknown> = {};
            for (const cell of nestedColumns as Array<{ name: string; value: unknown }>) {
                flat[cell.name] = cell.value;
            }
            // Preserve any other top-level row fields except the nested `columns`.
            const withoutColumns: Record<string, unknown> = { ...raw };
            delete withoutColumns['columns'];
            return { ...withoutColumns, ...flat };
        }
        return row;
    });

    return {
        ...table,
        columns: normalizedColumns,
        rows: normalizedRows,
    };
}

@Injectable({
    providedIn: 'root',
})
export class FlowAssistantService {
    private readonly api = inject(FlowAssistantApiService);
    private readonly toastService = inject(ToastService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly router = inject(Router);

    readonly isOpen = signal(false);
    readonly currentGraphId = signal<number | null>(null);
    readonly currentConversationId = signal<number | null>(null);
    readonly messages = signal<FlowAssistantMessage[]>([]);
    readonly isStreaming = signal(false);
    readonly config = signal<FlowAssistantConfig | null>(null);
    readonly dockWidth = signal<number>(this.loadPersistedWidth());
    readonly sessions = signal<SessionSummary[]>([]);
    readonly currentStatus = signal<string | null>(null);
    readonly pendingPromptChips = signal<ActionItem[]>([]);

    readonly starterChips = computed<ActionItem[]>(() => {
        if (this.pendingPromptChips().length > 0) return [];
        const hasConversation = this.currentConversationId() !== null;
        const hasVisibleMessages = this.messages().some((m) => m.role === 'user' || m.role === 'assistant');
        return hasConversation && hasVisibleMessages ? [] : STARTER_PROMPT_CHIPS;
    });

    private activeEventSource: EventSource | null = null;
    private firstTokenOfTurn = false;
    private hasOpenedOnCurrentVisit = false;

    open(graphId: number): void {
        // Re-opening on the same visit after close() — just unhide, don't disturb state.
        if (this.hasOpenedOnCurrentVisit && this.currentGraphId() === graphId) {
            this.isOpen.set(true);
            return;
        }
        // First time on this flow visit (or a different graphId). Full reset.
        this.reset();
        this.currentGraphId.set(graphId);
        this.isOpen.set(true);
        this.hasOpenedOnCurrentVisit = true;

        this.api
            .getConfig(graphId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (cfg) => this.config.set(cfg),
                error: () => this.toastService.error('Failed to load assistant config'),
            });

        // Populate sidebar but do NOT auto-select most recent — leave thread empty.
        this.loadSessions(graphId, false);
    }

    close(): void {
        this.closeEventSource();
        this.isOpen.set(false);
    }

    reset(): void {
        // Nuclear reset — clears every per-user signal plus isOpen.
        // Intended for auth-layer logout hooks and fresh-visit setup.
        this.closeEventSource();
        this.currentGraphId.set(null);
        this.currentConversationId.set(null);
        this.messages.set([]);
        this.isStreaming.set(false);
        this.config.set(null);
        this.sessions.set([]);
        this.currentStatus.set(null);
        this.pendingPromptChips.set([]);
        this.isOpen.set(false);
        this.hasOpenedOnCurrentVisit = false;
    }

    markFreshVisit(graphId: number): void {
        this.hasOpenedOnCurrentVisit = false;
        this.closeEventSource(); // defensive — kill any in-flight stream
        this.currentGraphId.set(graphId);
    }

    toggle(graphId: number): void {
        if (this.isOpen() && this.currentGraphId() === graphId) {
            this.close();
        } else {
            this.open(graphId);
        }
    }

    cancelStream(): void {
        const graphId = this.currentGraphId();
        const convId = this.currentConversationId();
        if (graphId == null || convId == null || !this.isStreaming()) return;
        // Optimistically tear down locally — backend cancel is best-effort.
        this.closeEventSource();
        this.isStreaming.set(false);
        this.currentStatus.set(null);
        // Fire-and-forget POST. If the backend hasn't responded yet, the Redis flag
        // still gets set and the server-side loop bails on its next checkpoint.
        this.api.cancelConversation(graphId, convId).subscribe({
            error: () => {
                /* silent — local teardown already happened */
            },
        });
    }

    loadSessions(graphId: number, autoSelect = true): void {
        this.api
            .listConversations(graphId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    const list = Array.isArray(response) ? response : response.results;
                    this.sessions.set(list);
                    if (autoSelect && list.length > 0) {
                        this.selectSession(list[0].id);
                    }
                },
                error: () => this.toastService.error('Failed to load sessions'),
            });
    }

    startNewSession(): void {
        const graphId = this.currentGraphId();
        if (!graphId) return;

        this.api
            .startConversation(graphId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ conversation_id }) => {
                    const placeholder: SessionSummary = {
                        id: conversation_id,
                        title: '',
                        started_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString(),
                        message_count: 0,
                    };
                    this.sessions.update((prev) => [placeholder, ...prev]);
                    this.currentConversationId.set(conversation_id);
                    this.messages.set([]);
                },
                error: () => this.toastService.error('Failed to start conversation'),
            });
    }

    selectSession(id: number): void {
        const graphId = this.currentGraphId();
        if (!graphId) return;

        this.api
            .getConversation(graphId, id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (conversation) => {
                    this.currentConversationId.set(id);
                    const normalized = conversation.messages.map((m) => {
                        if (m.role === 'assistant' && m.ef_tables && m.ef_tables.length > 0) {
                            return { ...m, ef_tables: m.ef_tables.map(normalizeEfTable) };
                        }
                        return m;
                    });
                    this.messages.set(normalized);
                },
                error: () => this.toastService.error('Failed to load conversation'),
            });
    }

    deleteSession(id: number): void {
        const graphId = this.currentGraphId();
        if (!graphId) return;

        this.api
            .deleteConversation(graphId, id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.sessions.update((prev) => prev.filter((s) => s.id !== id));
                    if (this.currentConversationId() === id) {
                        const remaining = this.sessions();
                        if (remaining.length > 0) {
                            this.selectSession(remaining[0].id);
                        } else {
                            this.startNewSession();
                        }
                    }
                },
                error: () => this.toastService.error('Failed to delete conversation'),
            });
    }

    sendMessage(text: string): void {
        const graphId = this.currentGraphId();
        const trimmed = text.trim();
        if (!graphId || !trimmed || this.isStreaming()) return;

        // Clear pending prompt chips — the user is moving on.
        this.pendingPromptChips.set([]);

        const existing = this.currentConversationId();
        if (existing !== null) {
            this.sendMessageToConversation(trimmed, existing, graphId);
            return;
        }

        // Lazy session creation on first send.
        this.api
            .startConversation(graphId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: ({ conversation_id }) => {
                    this.currentConversationId.set(conversation_id);
                    const now = new Date().toISOString();
                    this.sessions.update((current) => [
                        {
                            id: conversation_id,
                            title: '',
                            started_at: now,
                            last_message_at: now,
                            message_count: 0,
                        },
                        ...current,
                    ]);
                    this.sendMessageToConversation(trimmed, conversation_id, graphId);
                },
                error: () => this.toastService.error('Failed to start session'),
            });
    }

    private sendMessageToConversation(text: string, conversationId: number, graphId: number): void {
        this.appendMessage({ role: 'user', content: text });
        this.isStreaming.set(true);

        this.api
            .sendMessage(graphId, conversationId, text)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => this.openEventStream(response.stream_url),
                error: () => {
                    this.isStreaming.set(false);
                    this.toastService.error('Failed to send message');
                },
            });
    }

    updateConfig(patch: Partial<FlowAssistantConfig>): void {
        const graphId = this.currentGraphId();
        if (!graphId) return;

        this.api
            .patchConfig(graphId, patch)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (updated) => this.config.set(updated),
                error: () => this.toastService.error('Failed to update assistant config'),
            });
    }

    setDockWidth(width: number): void {
        this.dockWidth.set(width);
        try {
            localStorage.setItem(PANEL_WIDTH_KEY, String(width));
        } catch {
            // Ignore storage errors
        }
    }

    private openEventStream(streamUrl: string): void {
        this.closeEventSource();

        const assistantMessageIndex = this.addEmptyAssistantMessage();
        this.firstTokenOfTurn = true;
        this.currentStatus.set('Thinking…');

        try {
            const source = new EventSource(streamUrl);
            this.activeEventSource = source;

            source.addEventListener('token', (event: MessageEvent) => {
                this.handleTokenEvent(event, assistantMessageIndex);
            });

            source.addEventListener('tool_call', (event: MessageEvent) => {
                this.handleToolCallEvent(event);
            });

            source.addEventListener('tool_result', (event: MessageEvent) => {
                this.handleToolResultEvent(event);
            });

            source.addEventListener('structured', (event: MessageEvent) => {
                this.handleStructuredEvent(event);
            });

            source.addEventListener('done', (event: MessageEvent) => {
                this.handleDoneEvent(event);
            });

            source.addEventListener('error', (event: MessageEvent) => {
                this.handleErrorEvent(event);
            });

            source.onerror = () => {
                this.currentStatus.set(null);
                this.closeEventSource();
                this.isStreaming.set(false);
            };
        } catch {
            this.currentStatus.set(null);
            this.isStreaming.set(false);
            this.toastService.error('Failed to open stream connection');
        }
    }

    private handleTokenEvent(event: MessageEvent, assistantMessageIndex: number): void {
        const parsed = this.parseEventData<StreamEvent>(event.data);
        if (!parsed || parsed.type !== 'token') return;

        if (this.firstTokenOfTurn) {
            this.firstTokenOfTurn = false;
            this.currentStatus.set('Writing reply…');
        }

        this.messages.update((msgs) => {
            const next = [...msgs];
            const msg = next[assistantMessageIndex];
            if (msg && msg.role === 'assistant') {
                next[assistantMessageIndex] = {
                    ...msg,
                    content: msg.content + parsed.content,
                };
            }
            return next;
        });
    }

    private handleToolCallEvent(event: MessageEvent): void {
        const parsed = this.parseEventData<StreamEvent>(event.data);
        if (!parsed || parsed.type !== 'tool_call') return;

        this.currentStatus.set(toolStatusFor(parsed));

        this.appendMessage({
            role: 'tool',
            content: '',
            tool_call_id: parsed.id,
            name: parsed.name,
        });
    }

    private handleToolResultEvent(event: MessageEvent): void {
        const parsed = this.parseEventData<StreamEvent>(event.data);
        if (!parsed || parsed.type !== 'tool_result') return;

        this.currentStatus.set('Thinking…');

        this.messages.update((msgs) => {
            const next = [...msgs];
            let toolMsgIndex = -1;
            for (let i = next.length - 1; i >= 0; i--) {
                const m = next[i];
                if (m.role === 'tool' && m.tool_call_id === parsed.id) {
                    toolMsgIndex = i;
                    break;
                }
            }
            if (toolMsgIndex >= 0) {
                const existing = next[toolMsgIndex];
                if (existing.role === 'tool') {
                    next[toolMsgIndex] = { ...existing, content: parsed.content };
                }
            }
            return next;
        });
    }

    private handleDoneEvent(event: MessageEvent): void {
        // The `done` SSE event data may be empty or carry `{"interrupted": true}`.
        const parsed = this.parseEventData<StreamDoneEvent>(event.data);

        if (parsed?.interrupted) {
            this.messages.update((msgs) => {
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const msg = msgs[i];
                    if (msg.role === 'assistant') {
                        const updated: Extract<FlowAssistantMessage, { role: 'assistant' }> = {
                            ...msg,
                            interrupted: true,
                        };
                        const next = [...msgs];
                        next[i] = updated;
                        return next;
                    }
                }
                return msgs;
            });
        }

        this.currentStatus.set(null);
        this.closeEventSource();
        this.isStreaming.set(false);

        // Refresh sessions summary so the sidebar picks up updated
        // message_count, title (if just auto-derived), and last_message_at order.
        // autoSelect=false keeps the current conversation active.
        const graphId = this.currentGraphId();
        if (graphId !== null) {
            this.loadSessions(graphId, false);
        }
    }

    private handleErrorEvent(event: MessageEvent): void {
        const parsed = this.parseEventData<{ detail?: string }>(event.data);
        const detail = parsed?.detail ?? 'Stream error occurred';
        this.currentStatus.set(null);
        this.closeEventSource();
        this.isStreaming.set(false);
        this.toastService.error(detail);
    }

    executeAction(action: ActionItem): void {
        switch (action.action) {
            case 'sendAction':
            case 'sendButtonTextWithParams':
                this.sendMessage(action.text);
                break;
            case 'link': {
                const url = String(action.params?.['url'] ?? '');
                if (url) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
                break;
            }
            case 'openFlow': {
                const flowIdRaw = action.params?.['flowId'];
                const newGraphId = Number(flowIdRaw);
                if (!Number.isFinite(newGraphId)) break;

                this.cancelActiveStream();
                void this.router.navigate(['/flows', newGraphId]).then((navigated) => {
                    if (navigated) {
                        this.open(newGraphId);
                    }
                });
                break;
            }
            case 'openNode': {
                // TODO: The flow-builder does not currently consume the `openNode` query param.
                // When the flow-builder team wires the query param into the existing
                // node-panel-open API, this navigation will surface the correct panel automatically.
                const flowId = String(action.params?.['flowId'] ?? '');
                const nodeId = String(action.params?.['nodeId'] ?? '');
                if (flowId && nodeId) {
                    void this.router.navigate(['/flows', flowId], { queryParams: { openNode: nodeId } });
                } else if (flowId) {
                    void this.router.navigate(['/flows', flowId]);
                }
                break;
            }
            case 'refreshCache':
                window.location.reload();
                break;
            default:
                // For prompt-type chips with no action, treat like sendAction.
                if (action.type === 'prompt') {
                    this.sendMessage(action.text);
                }
                break;
        }
    }

    private handleStructuredEvent(event: MessageEvent): void {
        const parsed = this.parseEventData<StreamStructuredEvent>(event.data);
        if (!parsed || parsed.type !== 'structured') return;

        // Separate prompt-type actions (they go to pendingPromptChips, not inline under the message).
        const promptChips = parsed.action_message.filter((a) => a.type === 'prompt');
        const inlineActions = parsed.action_message.filter((a) => a.type !== 'prompt');

        if (promptChips.length > 0) {
            this.pendingPromptChips.set(promptChips);
        }

        const normalizedTables = (parsed.ef_tables ?? []).map(normalizeEfTable);
        const canonicalMessage = normalizedTables.length > 0 ? stripMarkdownTables(parsed.message) : parsed.message;

        this.messages.update((msgs) => {
            const next = [...msgs];
            // Locate the most recent assistant message and update it.
            for (let i = next.length - 1; i >= 0; i--) {
                const msg = next[i];
                if (msg.role === 'assistant') {
                    const updated: Extract<FlowAssistantMessage, { role: 'assistant' }> = {
                        ...msg,
                        // Replace streamed content with the canonical message only if non-empty.
                        content: canonicalMessage || msg.content,
                    };
                    if (normalizedTables.length > 0) {
                        updated.ef_tables = normalizedTables;
                    }
                    if (inlineActions.length > 0) {
                        updated.action_message = inlineActions;
                    }
                    next[i] = updated;
                    break;
                }
            }
            return next;
        });
    }

    private addEmptyAssistantMessage(): number {
        const emptyMsg: FlowAssistantMessage = { role: 'assistant', content: '' };
        this.messages.update((msgs) => [...msgs, emptyMsg]);
        return this.messages().length - 1;
    }

    private appendMessage(message: FlowAssistantMessage): void {
        this.messages.update((msgs) => [...msgs, message]);
    }

    private cancelActiveStream(): void {
        this.closeEventSource();
        this.isStreaming.set(false);
        this.currentStatus.set(null);
    }

    private closeEventSource(): void {
        if (this.activeEventSource) {
            this.activeEventSource.close();
            this.activeEventSource = null;
        }
    }

    private parseEventData<T>(data: string): T | null {
        try {
            return JSON.parse(data) as T;
        } catch {
            return null;
        }
    }

    private loadPersistedWidth(): number {
        try {
            const stored = localStorage.getItem(PANEL_WIDTH_KEY);
            const parsed = stored ? Number(stored) : NaN;
            return isFinite(parsed) && parsed >= 300 ? parsed : DEFAULT_PANEL_WIDTH;
        } catch {
            return DEFAULT_PANEL_WIDTH;
        }
    }
}
