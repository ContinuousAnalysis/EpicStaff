import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CheckboxComponent, IconButtonComponent, LoadingSpinnerComponent } from '@shared/components';
import { GraphMessagesComponent } from 'src/app/pages/running-graph/components/graph-messages/graph-messages.component';

import { GraphDto } from '../../models/graph.model';
import { GraphSessionLight, GraphSessionStatus } from '../../services/flows-sessions.service';
import { FlowSessionStatusBadgeComponent } from './flow-session-status-badge.component';
import { FlowSessionStatusFilterDropdownComponent } from './flow-session-status-filter-dropdown.component';
@Component({
    selector: 'app-flow-sessions-table',
    standalone: true,
    imports: [
        CommonModule,
        CheckboxComponent,
        FlowSessionStatusBadgeComponent,
        LoadingSpinnerComponent,
        IconButtonComponent,
        GraphMessagesComponent,
        FlowSessionStatusFilterDropdownComponent,
    ],
    template: `
        <div class="table-header">
            <div class="search-section"></div>
            <div class="bulk-actions-section">
                <div *ngIf="selectedIds().size > 0 && !isLoading && sessions.length > 0" class="bulk-actions">
                    <button class="delete-btn" (click)="bulkDelete()">Delete Selected</button>
                </div>
            </div>
        </div>
        <div class="sessions-table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%">
                            <app-checkbox
                                [checked]="areAllSelected()"
                                [disabled]="isLoading || sessions.length === 0"
                                (changed)="toggleSelectAll($event)"
                                id="select-all-checkbox"
                            ></app-checkbox>
                        </th>
                        <th style="width: 10%">ID</th>
                        <th style="width: 17%">
                            <app-flow-session-status-filter-dropdown
                                [value]="statusFilter"
                                (valueChange)="statusFilterChange.emit($event)"
                            >
                            </app-flow-session-status-filter-dropdown>
                        </th>
                        <th style="width: 25%">Created At</th>
                        <th style="width: 25%">Finished At</th>
                        <th style="width: 18%">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    @if (isLoading) {
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 40px;">
                                <app-loading-spinner size="md" message="Loading sessions..." />
                            </td>
                        </tr>
                    } @else if (showEmptyState) {
                        <tr>
                            <td colspan="7" style="text-align: center; padding: 40px;">
                                <div class="no-sessions-message">
                                    <p>No sessions found for the selected filters.</p>
                                    <small>Try adjusting your filter criteria or create a new session.</small>
                                </div>
                            </td>
                        </tr>
                    } @else {
                        <ng-container *ngFor="let session of sessions; trackBy: trackById">
                            <tr [class.row-expanded]="expandedSessionId() === session.id">
                                <td>
                                    <app-checkbox
                                        [checked]="isSelected(session.id)"
                                        (changed)="toggleSelection(session.id, $event)"
                                        [id]="'session-checkbox-' + session.id"
                                    ></app-checkbox>
                                </td>
                                <td>{{ session.id }}</td>
                                <td>
                                    <app-flow-session-status-badge
                                        [status]="session.status"
                                    ></app-flow-session-status-badge>
                                </td>
                                <td>{{ session.created_at | date: 'medium' }}</td>
                                <td>
                                    {{ session.finished_at ? (session.finished_at | date: 'medium') : 'Active' }}
                                </td>
                                <td>
                                    <div class="actions-container">
                                        <button
                                            class="view-btn"
                                            [class.view-btn--active]="expandedSessionId() === session.id"
                                            (click)="togglePreview(session.id)"
                                        >
                                            {{ expandedSessionId() === session.id ? 'Hide' : 'Preview' }}
                                        </button>
                                        <img
                                            src="assets/icons/ui/session-arrow.svg"
                                            alt="arrow-icon"
                                            class="arrow-icon"
                                            (click)="viewSession.emit(session.id)"
                                        />
                                        <img
                                            src="assets/icons/ui/stop-session.svg"
                                            alt="arrow-icon"
                                            *ngIf="canStop(session.status)"
                                            (click)="stopSession.emit(session.id)"
                                            title="Stop session"
                                            style="margin-left: 8px;"
                                            class="arrow-icon"
                                        />
                                        <app-icon-button
                                            *ngIf="!canStop(session.status)"
                                            icon="ui/x"
                                            size="1.5rem"
                                            ariaLabel="Delete session"
                                            (onClick)="deleteSelected.emit([session.id])"
                                        ></app-icon-button>
                                    </div>
                                </td>
                            </tr>

                            <tr *ngIf="expandedSessionId() === session.id" class="preview-row">
                                <td colspan="6" class="preview-cell">
                                    <div class="preview-content">
                                        <app-graph-messages
                                            [graphId]="flow.id"
                                            [sessionId]="session.id.toString()"
                                            [compact]="true"
                                        ></app-graph-messages>
                                    </div>
                                </td>
                            </tr>
                        </ng-container>
                    }
                </tbody>
            </table>
        </div>
    `,
    styleUrls: ['./flow-sessions-table.component.scss'],
})
export class FlowSessionsTableComponent {
    @Input() sessions: GraphSessionLight[] = [];
    @Input() flow!: GraphDto;
    @Input() isLoading: boolean = false;
    @Input() showEmptyState: boolean = false;
    @Input() statusFilter: string[] = ['all'];

    @Output() deleteSelected = new EventEmitter<number[]>();
    @Output() viewSession = new EventEmitter<number>();
    @Output() stopSession = new EventEmitter<number>();
    @Output() statusFilterChange = new EventEmitter<string[]>();

    public selectedIds = signal<Set<number>>(new Set());
    public expandedSessionId = signal<number | null>(null);

    public readonly GraphSessionStatus = GraphSessionStatus;

    constructor(private readonly cdr: ChangeDetectorRef) {}

    public togglePreview(sessionId: number): void {
        this.expandedSessionId.update((current) => (current === sessionId ? null : sessionId));
        this.cdr.markForCheck();
    }

    isSelected(id: number) {
        return this.selectedIds().has(id);
    }

    toggleSelection(id: number, checked: boolean) {
        this.selectedIds.update((set) => {
            const s = new Set(set);
            checked ? s.add(id) : s.delete(id);
            return s;
        });
        this.cdr.markForCheck();
    }

    areAllSelected() {
        return this.sessions.length > 0 && this.sessions.every((s) => this.selectedIds().has(s.id));
    }

    toggleSelectAll(checked: boolean) {
        this.selectedIds.set(checked ? new Set(this.sessions.map((s) => s.id)) : new Set());
        this.cdr.markForCheck();
    }

    bulkDelete() {
        this.deleteSelected.emit(Array.from(this.selectedIds()));
        this.selectedIds.set(new Set());
        this.cdr.markForCheck();
    }

    canStop(status: GraphSessionStatus) {
        return [GraphSessionStatus.RUNNING, GraphSessionStatus.WAITING_FOR_USER, GraphSessionStatus.PENDING].includes(
            status
        );
    }

    trackById(_: number, item: GraphSessionLight) {
        return item.id;
    }
}
