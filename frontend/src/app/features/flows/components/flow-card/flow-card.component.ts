import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { GraphDto } from '../../models/graph.model';
import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { FlowMenuComponent } from './flow-menu/flow-menu.component';

export type FlowAction = 'viewSessions' | 'delete' | 'open' | 'rename' | 'run';

export interface FlowCardAction {
  action: FlowAction;
  flow: GraphDto;
}

@Component({
  selector: 'app-flow-card',
  standalone: true,
  imports: [CommonModule, ButtonComponent, FlowMenuComponent],
  templateUrl: './flow-card.component.html',
  styleUrls: ['./flow-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowCardComponent {
  @Input({ required: true }) flow!: GraphDto;

  @Output() cardClick = new EventEmitter<GraphDto>();
  @Output() action = new EventEmitter<FlowCardAction>();

  public isMenuOpen = false;

  onCardClick(): void {
    this.cardClick.emit(this.flow);
  }

  onViewSessions(event: MouseEvent): void {
    event.stopPropagation();
    this.emitAction('viewSessions');
  }

  onMenuToggle(isOpen: boolean): void {
    this.isMenuOpen = isOpen;
  }

  onActionSelected(action: string): void {
    this.emitAction(action as FlowAction);
  }

  private emitAction(action: FlowAction): void {
    this.action.emit({
      action,
      flow: this.flow,
    });
  }
}
