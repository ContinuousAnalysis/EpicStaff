import {
    Component,
    Input,
    Output,
    EventEmitter,
    ChangeDetectionStrategy,
    inject,
    signal,
    computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { GetGraphLightRequest, SubflowLightDto } from '../../models/graph.model';
import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { FlowMenuComponent } from './flow-menu/flow-menu.component';
import { CheckboxComponent } from '../../../../shared/components/checkbox/checkbox.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { LabelsStorageService } from '../../services/labels-storage.service';

export type FlowAction =
    | 'viewSessions'
    | 'delete'
    | 'open'
    | 'rename'
    | 'run'
    | 'copy'
    | 'export';

export interface FlowCardAction {
    action: FlowAction;
    flow: GetGraphLightRequest;
}

@Component({
    selector: 'app-flow-card',
    standalone: true,
    imports: [CommonModule, ButtonComponent, FlowMenuComponent, CheckboxComponent, AppIconComponent],
    templateUrl: './flow-card.component.html',
    styleUrls: ['./flow-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowCardComponent {
    @Input({ required: true }) flow!: GetGraphLightRequest;
    @Input() selectMode: boolean = false;
    @Input() isSelected: boolean = false;
    @Output() selectionToggle = new EventEmitter<void>();
    @Output() cardClick = new EventEmitter<GetGraphLightRequest>();
    @Output() action = new EventEmitter<FlowCardAction>();

    private readonly labelsStorage = inject(LabelsStorageService);

    public isMenuOpen = false;
    public isExpanded = signal<boolean>(false);

    public readonly hasSubflows = computed(() => !!this.flow?.subflows?.length);

    toggleSubflows(event: MouseEvent): void {
        event.stopPropagation();
        this.isExpanded.update((v) => !v);
    }

    getLabelName(id: number): string {
        const label = this.labelsStorage.labels().find((l) => l.id === id);
        return label && !label.parent ? label.name : `/${label?.name}`;
    }

    formatDate(dateStr?: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return (
            d.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }) +
            ', ' +
            d.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
            })
        );
    }

    formatDateOnly(dateStr?: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    formatTimeOnly(dateStr?: string): string {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    onCardClick(): void {
        this.cardClick.emit(this.flow);
    }

    onMenuToggle(isOpen: boolean): void {
        this.isMenuOpen = isOpen;
    }

    onActionSelected(action: string): void {
        this.emitAction(action as FlowAction);
    }

    onSelectionToggle(event: MouseEvent): void {
        event.stopPropagation();
        this.selectionToggle.emit();
    }

    private emitAction(action: FlowAction): void {
        this.action.emit({
            action,
            flow: this.flow,
        });
    }

    // Subflow menu state tracking
    public subflowMenuStates = new Map<number, boolean>();

    public isSubflowMenuOpen(id: number): boolean {
        return this.subflowMenuStates.get(id) ?? false;
    }

    public onSubflowMenuToggle(id: number, isOpen: boolean): void {
        this.subflowMenuStates.set(id, isOpen);
    }

    public onSubflowActionSelected(action: string, subflow: SubflowLightDto): void {
        const flowLike: GetGraphLightRequest = {
            id: subflow.id,
            name: subflow.name,
            description: subflow.description,
            tags: subflow.tags,
            label_ids: subflow.label_ids,
            created_at: subflow.created_at,
            updated_at: subflow.updated_at,
        };
        this.action.emit({ action: action as FlowAction, flow: flowLike });
    }

    public onSubflowClick(subflow: SubflowLightDto): void {
        const flowLike: GetGraphLightRequest = {
            id: subflow.id,
            name: subflow.name,
            description: subflow.description,
            tags: subflow.tags,
            label_ids: subflow.label_ids,
            created_at: subflow.created_at,
            updated_at: subflow.updated_at,
        };
        this.cardClick.emit(flowLike);
    }
}
