import { Injectable, signal } from '@angular/core';
import {
    EpChatCommand,
    EpChatCommandResult,
    EpChatEvent,
    EpicChatCreateAgentPayload,
    EP_CHAT_ACTIONS,
} from './models/epic-chat-command.model';

@Injectable({
  providedIn: 'root',
})
export class EpicChatService {
    private readonly epChatCommandSignal = signal<EpChatCommand | null>(null);

    public readonly epChatCommand = this.epChatCommandSignal.asReadonly();

    public requestCreateAgent(payload: EpicChatCreateAgentPayload): void {
        this.epChatCommandSignal.set({
            requestId: this.generateRequestId(),
            action: EP_CHAT_ACTIONS.AGENT_CREATE,
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
                `[EpicChat command failed] ${result.action}, requestId=${result.requestId}: ${result.message || 'Unknown error'}`
            );
            return;
        }
        console.log(`[EpicChat command success] ${result.action}, requestId=${result.requestId}`);
    }

    public onEpChatEvent(event: Event): void {
        const data = (event as CustomEvent<EpChatEvent>).detail;
        if (!data || data.type === 'agents.changed') {
            return;
        }
        console.log('[EpicChat event]', data.type, data.payload || {});
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
