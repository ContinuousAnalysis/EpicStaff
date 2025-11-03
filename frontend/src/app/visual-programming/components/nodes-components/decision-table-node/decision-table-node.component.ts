import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecisionTableNodeModel } from '../../../core/models/node.model';
import { FormsModule } from '@angular/forms';
import { ClickOrDragDirective } from '../../flow-base-node/directives/click-or-drag.directive';

@Component({
    selector: 'app-decision-table-node',
    templateUrl: './decision-table-node.component.html',
    styleUrls: ['./decision-table-node.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, ClickOrDragDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableNodeComponent {
    @Input({ required: true }) node!: DecisionTableNodeModel;
    @Output() actualClick = new EventEmitter<MouseEvent>();

    get conditionGroups() {
        return this.node.data.table?.condition_groups ?? [];
    }

    onEditClick() {
        this.actualClick.emit();
    }
}
