import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
    EpChatCommand,
    EpChatCommandResult,
    EpChatEvent,
    EpicChatCreateAgentPayload,
    EP_CHAT_COMMANDS,
    EP_CHAT_EVENT_TYPES,
} from './models/epic-chat-command.model';
import { FlowUnsavedStateService } from 'src/app/pages/flows-page/services/flow-unsaved-state.service';

@Injectable({
    providedIn: 'root',
})
export class EpicChatService {
    private readonly epChatCommandSignal = signal<EpChatCommand | null>(null);

    public readonly epChatCommand = this.epChatCommandSignal.asReadonly();

    constructor(
        private readonly router: Router,
        private readonly flowUnsavedStateService: FlowUnsavedStateService,
    ) {}

    public requestCreateAgent(payload: EpicChatCreateAgentPayload): void {
        this.epChatCommandSignal.set({
            requestId: this.generateRequestId(),
            action: EP_CHAT_COMMANDS.AGENT_CREATE,
            payload,
        });
    }

    public onEpChatCommandResult(event: Event): void {
        const result = (event as CustomEvent<EpChatCommandResult>).detail;
        if (!result) {
            return;
        }
        if (!result.success) {
            console.error(
                `[EpicChat command failed] ${result.action}, requestId=${result.requestId}: ${result.message || 'Unknown error'}`,
            );
            return;
        }
        console.log(
            `[EpicChat command success] ${result.action}, requestId=${result.requestId}`,
        );
    }

    public onEpChatEvent(event: Event): void {
        console.log({ event });

        const data = (event as CustomEvent<EpChatEvent>).detail;
        if (!data) {
            return;
        }
        if (data.type === 'agents.changed') {
            return;
        }
        switch (data.type) {
            case EP_CHAT_EVENT_TYPES.APP_OPEN_FLOW: {
                const flowId = this.toNumber(data.payload?.['flowId']);
                if (flowId != null) {
                    this.router.navigate(['flows', flowId]);
                }
                return;
            }
            case EP_CHAT_EVENT_TYPES.APP_OPEN_NODE: {
                const flowId = this.toNumber(data.payload?.['flowId']);
                const nodeId =
                    data.payload?.['nodeId'] != null
                        ? String(data.payload['nodeId'])
                        : null;
                if (flowId != null) {
                    this.router.navigate(
                        ['flows', flowId],
                        nodeId ? { queryParams: { nodeId } } : {},
                    );
                }
                return;
            }
            case EP_CHAT_EVENT_TYPES.APP_REFRESH_CACHE: {
                this.flowUnsavedStateService
                    .confirmAndRefreshFlow()
                    .subscribe();
                return;
            }
            default:
                console.log('[EpicChat event]', data.type, data.payload || {});
        }
    }

    private toNumber(v: unknown): number | null {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    public toggleChat(host: HTMLElement | null | undefined): void {
        if (!host) {
            return;
        }
        const epicChatElement = host as {
            toggleChat?: () => void;
            shadowRoot?: ShadowRoot | null;
            querySelector?: (selectors: string) => Element | null;
        };
        if (epicChatElement.toggleChat) {
            epicChatElement.toggleChat();
            return;
        }
        const root = epicChatElement.shadowRoot ?? epicChatElement;
        const toggleButton =
            root.querySelector?.('.ep-chat-toggle-button') ??
            root.querySelector?.('ep-chat-toggle-button');
        if (toggleButton instanceof HTMLElement) {
            toggleButton.click();
        }
    }

    private generateRequestId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
}
