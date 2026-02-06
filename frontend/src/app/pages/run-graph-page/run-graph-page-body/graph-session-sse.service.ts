import { Injectable, signal } from '@angular/core';
import { GraphSessionStatus } from '../../../features/flows/services/flows-sessions.service';
import { GraphMessage } from '../../running-graph/models/graph-session-message.model';
import { Memory } from '../../running-graph/components/memory-sidebar/models/memory.model';
import { ConfigService } from '../../../services/config/config.service';
import { AuthService } from '../../../services/auth/auth.service';

@Injectable()
export class RunSessionSSEService {
  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {}

  private abortController: AbortController | null = null;
  private currentSessionId: string | null = null;
  private reconnectTimeout: any = null;

  // Signals
  private messagesSignal = signal<GraphMessage[]>([]);
  private statusSignal = signal<GraphSessionStatus>(GraphSessionStatus.RUNNING);
  private memoriesSignal = signal<Memory[]>([]);
  private streamOpen = signal(false);
  private connectionStatusSignal = signal<
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'reconnecting'
    | 'manually_disconnected'
  >('disconnected');

  public readonly isStreaming = this.streamOpen.asReadonly();
  public readonly messages = this.messagesSignal.asReadonly();
  public readonly status = this.statusSignal.asReadonly();
  public readonly memories = this.memoriesSignal.asReadonly();
  public readonly connectionStatus = this.connectionStatusSignal.asReadonly();

  public setStatus(status: GraphSessionStatus): void {
    this.statusSignal.set(status);
  }

  // Reconnection configuration
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly baseReconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 30000;
  private isManualDisconnect = false;

  private get apiUrl(): string {
    const baseUrl = this.configService.apiUrl;
    console.log('=== URL Construction Debug ===');
    console.log('1. ConfigService.apiUrl:', baseUrl);

    console.log('4. Current session ID:', this.currentSessionId);

    const url = `${baseUrl}run-session/subscribe/${this.currentSessionId}/`;
    console.log('5. Final constructed URL:', url);

    console.log(
      '7. Final URL contains /epicstaff/:',
      url.includes('/epicstaff/')
    );
    console.log('=== End URL Construction Debug ===');

    return url;
  }

  public startStream(sessionId: string): void {
    if (this.currentSessionId === sessionId && this.abortController) return;
    this.cleanup();
    this.currentSessionId = sessionId;
    this.isManualDisconnect = false;
    this.connect(sessionId);
  }

  public resumeStream(): void {
    if (!this.currentSessionId) return;
    this.isManualDisconnect = false;
    this.connect(this.currentSessionId);
  }

  public stopStream(): void {
    this.isManualDisconnect = true;
    this.disconnect();
    this.connectionStatusSignal.set('manually_disconnected');
  }

  private connect(sessionId: string): void {
    if (this.abortController) {
      console.warn('SSE already started');
      return;
    }

    const token = this.authService.getAccessToken();
    if (!token) {
      this.handleConnectionLoss();
      return;
    }

    this.connectionStatusSignal.set('connecting');
    this.abortController = new AbortController();

    fetch(this.apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: this.abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE failed with status ${response.status}`);
        }
        console.log('SSE connection established');
        this.reconnectAttempts = 0;
        this.streamOpen.set(true);
        this.connectionStatusSignal.set('connected');
        await this.consumeStream(response.body);
      })
      .catch((err) => {
        console.error('SSE error:', err);
        this.handleConnectionLoss();
      });
  }

  private handleConnectionLoss(): void {
    if (this.isManualDisconnect) {
      console.log('Manual disconnect - not attempting reconnection');
      return;
    }

    this.connectionStatusSignal.set('reconnecting');
    this.streamOpen.set(false);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `Max SSE reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`
      );
      this.finalDisconnect();
      return;
    }

    this.reconnectAttempts++;
    const delay = this.calculateReconnectDelay();

    console.log(
      `Connection lost. Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );
    console.log(`Current session ID: ${this.currentSessionId}`);

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isManualDisconnect && this.currentSessionId) {
        console.log(
          `Attempting to reconnect to session: ${this.currentSessionId}`
        );
        this.connect(this.currentSessionId);
      } else {
        console.log(
          'Reconnection cancelled - manual disconnect or no session ID'
        );
      }
    }, delay);
  }

  private calculateReconnectDelay(): number {
    // Exponential backoff with jitter to prevent thundering herd
    const exponentialDelay =
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const finalDelay = Math.min(
      exponentialDelay + jitter,
      this.maxReconnectDelayMs
    );

    console.log(
      `Reconnect delay calculation: base=${this.baseReconnectDelayMs}, attempt=${this.reconnectAttempts}, exponential=${exponentialDelay}, jitter=${jitter}, final=${finalDelay}`
    );

    return finalDelay;
  }

  private finalDisconnect(): void {
    console.log('Final disconnect after max reconnection attempts');
    this.disconnect();
    this.connectionStatusSignal.set('disconnected');
  }

  private disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log('SSE connection closed');
    }

    this.streamOpen.set(false);
    this.connectionStatusSignal.set('disconnected');
  }

  private cleanup(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log('SSE cleanup completed');
    }

    this.reconnectAttempts = 0;
    this.currentSessionId = null;
    this.isManualDisconnect = false;

    this.messagesSignal.set([]);
    this.memoriesSignal.set([]);
    this.statusSignal.set(GraphSessionStatus.RUNNING);
    this.streamOpen.set(false);
    this.connectionStatusSignal.set('disconnected');
  }

  private async consumeStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        this.handleConnectionLoss();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const chunk = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        this.handleSseChunk(chunk);
        boundaryIndex = buffer.indexOf('\n\n');
      }
    }
  }

  private handleSseChunk(chunk: string): void {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.replace('event:', '').trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.replace('data:', '').trim());
      }
    }

    const data = dataLines.join('\n');
    this.dispatchEvent(eventName, data);
  }

  private dispatchEvent(eventName: string, data: string): void {
    if (eventName === 'messages') {
      this.handleMessages(data);
    } else if (eventName === 'status') {
      this.handleStatus(data);
    } else if (eventName === 'memory') {
      this.handleMemory(data);
    } else if (eventName === 'memory-delete') {
      this.handleMemoryDelete(data);
    } else if (eventName === 'fatal-error') {
      this.handleFatal();
    } else {
      console.warn('Unnamed event received:', data);
    }
  }

  private handleMessages(rawData: string): void {
    const raw = JSON.parse(rawData);
    const msg: GraphMessage = {
      id: raw.id,
      uuid: raw.uuid,
      session: raw.session_id,
      name: raw.name,
      execution_order: raw.execution_order,
      created_at: raw.created_at || raw.timestamp,
      message_data: raw.message_data,
    };

    const messagesList = this.messages();
    const exists = messagesList.some((m) => m.uuid === msg.uuid);
    if (!exists) {
      messagesList.push(msg);
      messagesList.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      this.messagesSignal.set([...messagesList]);
    }
  }

  private handleStatus(rawData: string): void {
    const statusData = JSON.parse(rawData);
    this.statusSignal.set(statusData.status as GraphSessionStatus);
  }

  private handleMemory(rawData: string): void {
    const memory = JSON.parse(rawData) as Memory;
    const memoriesList = this.memories();
    const existingIndex = memoriesList.findIndex((m) => m.id === memory.id);

    if (existingIndex !== -1) {
      memoriesList[existingIndex] = memory;
    } else {
      memoriesList.push(memory);
    }

    this.memoriesSignal.set([...memoriesList]);
  }

  private handleMemoryDelete(rawData: string): void {
    const memory = JSON.parse(rawData);
    const memoriesList = this.memories();
    const existingIndex = memoriesList.findIndex((m) => m.id === memory);

    if (existingIndex !== -1) {
      memoriesList.splice(existingIndex, 1);
      this.memoriesSignal.set([...memoriesList]);
    }
  }

  private handleFatal(): void {
    console.error('Fatal SSE error received');
    this.handleConnectionLoss();
  }
}
