import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    HostListener,
    inject,
    signal,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarkdownModule } from 'ngx-markdown';

import { AppSvgIconComponent } from '../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { FlowAssistantService } from '../../flow-assistant.service';
import { ActionItem, EfTable, FlowAssistantMessage } from '../../models/flow-assistant.model';
import { FlowAssistantActionsComponent } from '../flow-assistant-actions/flow-assistant-actions.component';
import { FlowAssistantSettingsComponent } from '../flow-assistant-settings/flow-assistant-settings.component';
import { FlowAssistantSidebarComponent } from '../flow-assistant-sidebar/flow-assistant-sidebar.component';
import { FlowAssistantTableComponent } from '../flow-assistant-table/flow-assistant-table.component';

const MIN_PANEL_WIDTH = 300;
const MAX_PANEL_WIDTH = 800;
const SIDEBAR_OPEN_KEY = 'flow_assistant_sidebar_open';
const SCROLL_AT_BOTTOM_THRESHOLD = 50;

@Component({
    selector: 'app-flow-assistant-panel',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MarkdownModule,
        AppSvgIconComponent,
        FlowAssistantSettingsComponent,
        FlowAssistantSidebarComponent,
        FlowAssistantTableComponent,
        FlowAssistantActionsComponent,
    ],
    templateUrl: './flow-assistant-panel.component.html',
    styleUrls: ['./flow-assistant-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowAssistantPanelComponent {
    @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
    @ViewChild('messageInput') messageInput?: ElementRef<HTMLTextAreaElement>;

    readonly assistantService = inject(FlowAssistantService);

    readonly showSettings = signal(false);
    readonly inputText = signal('');
    readonly sidebarOpen = signal<boolean>(this.loadPersistedSidebarOpen());

    readonly messages = computed(() => this.assistantService.messages());
    readonly isStreaming = computed(() => this.assistantService.isStreaming());
    readonly panelWidth = computed(() => this.assistantService.dockWidth());
    readonly sendDisabled = computed(() => this.isStreaming() || !this.inputText().trim());
    readonly currentStatus = computed(() => this.assistantService.currentStatus());
    readonly displayChips = computed(() => {
        const pending = this.assistantService.pendingPromptChips();
        return pending.length > 0 ? pending : this.assistantService.starterChips();
    });

    private readonly isAtBottom = signal(true);

    // 4. Effects
    private readonly scrollEffect = effect(() => {
        const msgs = this.messages();
        // Read last message content length so this effect re-fires on every streamed token.
        void (msgs.length > 0 ? ((msgs[msgs.length - 1] as { content?: string }).content?.length ?? 0) : 0);
        // Read status so the effect re-fires when the status line appears / disappears.
        void this.currentStatus();

        if (!this.isAtBottom()) return;

        // Schedule after the current rendering cycle so the DOM reflects the new content.
        requestAnimationFrame(() => {
            const container = this.messagesContainer?.nativeElement;
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    });

    private isDragging = false;
    private dragStartX = 0;
    private dragStartWidth = 0;

    isToolMessage(
        message: FlowAssistantMessage
    ): message is { role: 'tool'; content: string; tool_call_id: string; name: string } {
        return message.role === 'tool';
    }

    isAssistantMessage(
        message: FlowAssistantMessage
    ): message is { role: 'assistant'; content: string; ef_tables?: EfTable[]; action_message?: ActionItem[] } {
        return message.role === 'assistant';
    }

    isUserMessage(message: FlowAssistantMessage): message is { role: 'user'; content: string } {
        return message.role === 'user';
    }

    onActionExecuted(action: ActionItem): void {
        this.assistantService.executeAction(action);
    }

    toggleSettings(): void {
        this.showSettings.update((v) => !v);
    }

    toggleSidebar(): void {
        const next = !this.sidebarOpen();
        this.sidebarOpen.set(next);
        this.persistSidebarOpen(next);
    }

    closeSidebar(): void {
        if (!this.sidebarOpen()) return;
        this.sidebarOpen.set(false);
        this.persistSidebarOpen(false);
    }

    onChatBodyClick(): void {
        this.closeSidebar();
    }

    close(): void {
        this.assistantService.close();
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    sendMessage(): void {
        const text = this.inputText().trim();
        if (!text || this.sendDisabled()) return;

        this.assistantService.sendMessage(text);
        this.inputText.set('');
        this.autoResizeInput();
    }

    onInputChange(event: Event): void {
        const target = event.target as HTMLTextAreaElement;
        this.inputText.set(target.value);
        this.autoResizeInput();
    }

    onDragHandleMousedown(event: MouseEvent): void {
        event.preventDefault();
        this.isDragging = true;
        this.dragStartX = event.clientX;
        this.dragStartWidth = this.panelWidth();
    }

    @HostListener('document:mousemove', ['$event'])
    onDocumentMousemove(event: MouseEvent): void {
        if (!this.isDragging) return;
        const delta = this.dragStartX - event.clientX;
        const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, this.dragStartWidth + delta));
        this.assistantService.setDockWidth(newWidth);
    }

    @HostListener('document:mouseup')
    onDocumentMouseup(): void {
        this.isDragging = false;
    }

    onMessagesScroll(): void {
        const container = this.messagesContainer?.nativeElement;
        if (!container) return;
        const atBottom =
            container.scrollTop + container.clientHeight >= container.scrollHeight - SCROLL_AT_BOTTOM_THRESHOLD;
        this.isAtBottom.set(atBottom);
    }

    trackByIndex(index: number): number {
        return index;
    }

    private loadPersistedSidebarOpen(): boolean {
        try {
            return localStorage.getItem(SIDEBAR_OPEN_KEY) === 'true';
        } catch {
            return false;
        }
    }

    private persistSidebarOpen(value: boolean): void {
        try {
            localStorage.setItem(SIDEBAR_OPEN_KEY, String(value));
        } catch {
            // Ignore storage errors
        }
    }

    private autoResizeInput(): void {
        const el = this.messageInput?.nativeElement;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
}
