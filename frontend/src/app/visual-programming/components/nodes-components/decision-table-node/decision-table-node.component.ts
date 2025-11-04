import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, NgStyle } from '@angular/common';
import { DecisionTableNodeModel } from '../../../core/models/node.model';
import { FormsModule } from '@angular/forms';
import { ClickOrDragDirective } from '../../flow-base-node/directives/click-or-drag.directive';
import { FFlowModule } from '@foblex/flow';

@Component({
    selector: 'app-decision-table-node',
    templateUrl: './decision-table-node.component.html',
    styleUrls: ['./decision-table-node.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, ClickOrDragDirective, FFlowModule, NgStyle],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableNodeComponent {
    @Input({ required: true }) node!: DecisionTableNodeModel;
    @Output() actualClick = new EventEmitter<MouseEvent>();

    get conditionGroups() {
        const allGroups = this.node.data.table?.condition_groups ?? [];
        return allGroups.filter(group => group.valid === true);
    }

    get defaultNextNode() {
        return this.node.data.table?.default_next_node;
    }

    get errorNextNode() {
        return this.node.data.table?.error_next_node;
    }

    get inputPort() {
        return this.node.ports?.find((p) => p.port_type === 'input');
    }

    get defaultPort() {
        return this.node.ports?.find((p) => p.role === 'decision-default');
    }

    get errorPort() {
        return this.node.ports?.find((p) => p.role === 'decision-error');
    }

    getPortForGroup(index: number) {
        const groupName = this.conditionGroups[index]?.group_name;
        if (!groupName) return undefined;
        
        return this.node.ports?.find(
            (p) => p.role === `decision-out-${groupName}`
        );
    }

    onEditClick() {
        this.actualClick.emit();
    }
}
