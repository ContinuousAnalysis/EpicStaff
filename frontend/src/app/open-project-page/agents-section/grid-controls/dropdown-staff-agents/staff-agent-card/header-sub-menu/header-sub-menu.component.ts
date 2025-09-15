import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClickOutsideDirective } from '../../../../../../shared/directives/click-outside.directive';
import { CardState } from '../staff-agent-card.component';
import { FullAgent } from '../../../../../../services/full-agent.service';
import { ToastService } from '../../../../../../services/notifications/toast.service';

@Component({
  selector: 'app-agent-menu',
  standalone: true,
  imports: [CommonModule, ClickOutsideDirective],
  template: `
    <div
      class="menu-container"
      *ngIf="isOpen"
      (clickOutside)="onClickOutside()"
    >
      <!-- <div class="menu-item" (click)="onEditAgent()">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
          <path d="M13.5 6.5l4 4" />
        </svg>
        <span>Edit Agent</span>
      </div> -->

      <div
        *ngIf="state === 'default'"
        class="menu-item remove-item"
        (click)="onRemoveAgent()"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4 7h16" />
          <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
          <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
          <path d="M10 12l4 4m0 -4l-4 4" />
        </svg>
        <span>Remove Agent</span>
      </div>
    </div>
  `,
  styles: [
    `
      .menu-container {
        position: absolute;
        top: 40px;
        right: 0;
        width: 220px;
        background-color: var(--gray-850);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        border: 1px solid var(--gray-750);
        overflow: hidden;
        z-index: 1000;
      }
      .menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        color: var(--gray-300);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .menu-item:hover {
        background-color: var(--gray-800);
        color: var(--gray-100);
      }
      .menu-item svg {
        opacity: 0.8;
      }
      .menu-item:hover svg {
        opacity: 1;
      }
      .remove-item {
        color: var(--red-color, #dc3545);
        border-top: 1px solid var(--gray-750);
        margin-top: 5px;
        padding-top: 10px;
      }
      .remove-item:hover {
        background-color: rgba(220, 53, 69, 0.1);
        color: var(--red-color, #dc3545);
      }
    `,
  ],
})
export class AgentMenuComponent {
  @Input() isOpen = false;
  @Input() state: CardState = 'default';
  @Input() agent!: FullAgent;

  @Output() close = new EventEmitter<void>();
  @Output() advancedSettings = new EventEmitter<void>();
  @Output() addToFavorites = new EventEmitter<void>();
  @Output() removeAgent = new EventEmitter<void>();
  @Output() editAgent = new EventEmitter<void>();

  constructor(private toastService: ToastService) {}

  onClickOutside(): void {
    this.close.emit();
  }

  onAdvancedSettings(): void {
    this.toastService.info(`Feature not implemented yet`);
    this.advancedSettings.emit();
    this.close.emit();
  }

  onAddToFavorites(): void {
    this.toastService.info(`Feature not implemented yet`);
    this.addToFavorites.emit();
    this.close.emit();
  }

  onRemoveAgent(): void {
    this.removeAgent.emit();
    this.close.emit();
  }

  onEditAgent(): void {
    this.editAgent.emit();
    this.close.emit();
  }
}
