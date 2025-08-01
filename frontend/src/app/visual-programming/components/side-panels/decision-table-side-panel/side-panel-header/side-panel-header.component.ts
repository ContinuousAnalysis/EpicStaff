import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconButtonComponent } from '../../../../../shared/components/buttons/icon-button/icon-button.component';
import { NodeModel } from '../../../../core/models/node.model';
import { NODE_ICONS, NODE_COLORS } from '../../../../core/enums/node-config';
import { getNodeTitle } from '../../../../core/enums/node-title.util';

@Component({
  selector: 'app-side-panel-header',
  standalone: true,
  imports: [CommonModule, IconButtonComponent],
  template: `
    <div class="header">
      <div class="title">
        <i [class]="icon" [style.color]="color"></i>
        <span>{{ title }}</span>
      </div>
      <app-icon-button
        icon="ui/x"
        size="2rem"
        ariaLabel="Close panel"
        (onClick)="close.emit()"
      ></app-icon-button>
    </div>
  `,
  styleUrls: ['./side-panel-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidePanelHeaderComponent {
  @Input() node!: NodeModel;
  @Output() close = new EventEmitter<void>();

  get icon(): string {
    return NODE_ICONS[this.node?.type] || '';
  }
  get color(): string {
    return NODE_COLORS[this.node?.type] || '#fff';
  }
  get title(): string {
    return getNodeTitle(this.node);
  }
}
