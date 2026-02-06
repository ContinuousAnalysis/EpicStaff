import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EpicChatService {
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
}
