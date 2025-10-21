import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecisionTableNodeModel } from '../../../core/models/node.model';

import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-decision-table-node',
    templateUrl: './decision-table-node.component.html',
    styleUrls: ['./decision-table-node.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionTableNodeComponent {
    @Input({ required: true }) node!: DecisionTableNodeModel;

    get conditionGroups() {
        return this.node.data.table?.condition_groups ?? [];
    }
}
