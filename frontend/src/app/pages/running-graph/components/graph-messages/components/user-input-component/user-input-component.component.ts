import { Component, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-wait-for-user-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wait-for-user-container">
      <div class="options-row">
        <div class="quick-options">
          <button
            class="done-btn"
            (click)="markAsDone()"
            [disabled]="isSubmitting"
            title="Mark as Done"
          >
            <i class="ti ti-check"></i>Mark as Done
          </button>
          <div class="feedback-message">
            Please provide a feedback for the agent
          </div>
        </div>

        <button
          class="send-btn"
          (click)="sendMessage()"
          [disabled]="!userMessage.trim() || isSubmitting"
          title="Send"
        >
          <ng-container *ngIf="!isSubmitting">
            <i class="ti ti-send"></i>Send
          </ng-container>
          <div *ngIf="isSubmitting" class="spinner"></div>
        </button>
      </div>

      <div class="input-container">
        <textarea
          [(ngModel)]="userMessage"
          placeholder="Type your feedback..."
          (keydown.enter)="handleEnterKey($event)"
        ></textarea>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        width: 100%;
        max-width: 850px;
        margin-bottom: 1rem;
      }

      .wait-for-user-container {
        background-color: #151515;
        border-radius: 6px;
        padding: 1.25rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-left: 4px solid #ffa726;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .feedback-message {
        color: var(--gray-200);
        font-size: 1rem;
      }

      .options-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
      }

      .quick-options {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .input-container {
        position: relative;
        display: flex;
        width: 100%;
      }

      textarea {
        background-color: var(--gray-800);
        color: var(--gray-200);
        border: 1px solid var(--gray-750);
        border-radius: 6px;
        padding: 0.75rem;
        font-family: inherit;
        font-size: 1rem;
        width: 100%;
        min-height: 100px;
        resize: vertical;
        transition: border-color 0.2s ease;

        &:focus {
          outline: none;
          border-color: #ffa726;
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      }

      .send-btn {
        background-color: #ffa726;
        color: var(--gray-900);
        border: none;
        border-radius: 6px;
        width: auto;
        min-width: 80px;
        height: 38px;
        padding: 0.5rem 0.875rem;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        cursor: pointer;
        transition: all 0.2s ease;
        flex-shrink: 0;

        i {
          font-size: 1.125rem;
          height: 1.125rem;
          width: 1.125rem;
          margin-top: 2px;
        }

        &:hover {
          box-shadow: 0 2px 5px rgba(255, 167, 38, 0.3);
        }

        &:disabled {
          background-color: var(--gray-700);
          cursor: not-allowed;
          opacity: 0.7;

          &:hover {
            transform: none;
            box-shadow: none;
          }
        }
      }

      .done-btn {
        background-color: var(--gray-800);
        color: var(--gray-200);
        border: 1px solid var(--gray-700);
        border-radius: 6px;
        padding: 0.5rem 0.875rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        height: 38px;

        i {
          font-size: 1.125rem;
          height: 1.125rem;
          width: 1.125rem;
        }

        &:hover {
          background-color: var(--gray-750);
          border-color: var(--gray-600);
        }

        &:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }
      }

      /* Spinner styles */
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-radius: 50%;
        border-top-color: var(--gray-900);
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class WaitForUserInputComponent implements OnDestroy {
  @Output() messageSubmitted = new EventEmitter<string>();
  userMessage = '';
  isSubmitting = false;

  sendMessage() {
    if (this.userMessage.trim() && !this.isSubmitting) {
      this.isSubmitting = true;
      this.messageSubmitted.emit(this.userMessage);
      this.userMessage = '';
      // Note: The spinner will remain until the component is destroyed
    }
  }

  markAsDone() {
    if (!this.isSubmitting) {
      this.isSubmitting = true;
      this.messageSubmitted.emit('</done/>');
    }
  }

  handleEnterKey(event: any) {
    // Send message on Enter (without Shift)
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  ngOnDestroy() {}
}
