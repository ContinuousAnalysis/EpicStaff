import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphSessionStatus } from '../../services/flows-sessions.service';

@Component({
  selector: 'app-flow-session-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="status-badge" [ngClass]="statusClass">
      {{ statusLabel }}
    </span>
  `,
  styleUrls: ['./flow-session-status-badge.component.scss'],
})
export class FlowSessionStatusBadgeComponent {
  @Input() status!: GraphSessionStatus;

  get statusLabel(): string {
    switch (this.status) {
      case GraphSessionStatus.RUNNING:
        return 'Running';
      case GraphSessionStatus.ERROR:
        return 'Error';
      case GraphSessionStatus.ENDED:
        return 'Completed';
      case GraphSessionStatus.WAITING_FOR_USER:
        return 'Waiting';
      case GraphSessionStatus.PENDING:
        return 'Pending';
      case GraphSessionStatus.EXPIRED:
        return 'Expired';
      default:
        return 'Unknown';
    }
  }

  get statusClass(): string {
    switch (this.status) {
      case GraphSessionStatus.RUNNING:
        return 'status-running';
      case GraphSessionStatus.ERROR:
        return 'status-error';
      case GraphSessionStatus.ENDED:
        return 'status-completed';
      case GraphSessionStatus.WAITING_FOR_USER:
        return 'status-waiting';
      case GraphSessionStatus.PENDING:
        return 'status-pending';
      case GraphSessionStatus.EXPIRED:
        return 'status-expired';
      default:
        return 'status-unknown';
    }
  }
}
