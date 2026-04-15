import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';
import { PaginationControlsComponent } from '@shared/components';

import { FlowSessionStatusFilterDropdownComponent } from '../../components/flow-sessions-dialog/flow-session-status-filter-dropdown.component';
import { FlowSessionsTableComponent } from '../../components/flow-sessions-dialog/flow-sessions-table.component';
import { GraphSessionLight, GraphSessionService } from '../../services/flows-sessions.service';

@Component({
    selector: 'app-global-sessions-list',
    standalone: true,
    imports: [
        CommonModule,
        FlowSessionsTableComponent,
        FlowSessionStatusFilterDropdownComponent,
        PaginationControlsComponent,
    ],
    template: ` <div class="global-sessions-wrapper">
        <div class="global-sessions-header">
            <h2>All Sessions</h2>
        </div>
        <div class="global-sessions-content">
            <div class="filter-controls">
                <app-flow-session-status-filter-dropdown
                    [value]="statusFilter()"
                    (valueChange)="onStatusFilterChange($event)"
                ></app-flow-session-status-filter-dropdown>
            </div>
            <div class="table-container">
                <app-flow-sessions-table
                    [sessions]="sessions()"
                    [isLoading]="!isLoaded()"
                    [showEmptyState]="isLoaded() && sessions().length === 0"
                    (deleteSelected)="onDeleteSelected($event)"
                    (viewSession)="onViewSessions($event)"
                ></app-flow-sessions-table>
            </div>

            @if (isLoaded() && totalCount > pageSize()) {
                <div class="pagination-container">
                    <app-pagination-controls
                        [pageSize]="pageSize()"
                        [totalCount]="totalCount"
                        [currentPage]="currentPage()"
                        [maxPagesToShow]="5"
                        (pageChange)="onPageChange($event)"
                    ></app-pagination-controls>
                </div>
            }
        </div>
    </div>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSessionsListComponent {
    public sessions = signal<GraphSessionLight[]>([]);
    public isLoaded = signal<boolean>(false);
    public currentPage = signal(1);
    public pageSize = signal(10);
    public statusFilter = signal<string[]>(['all']);
    public totalCount = 0;
    private reloadTrigger = signal(0);

    constructor(private graphSessionService: GraphSessionService) {
        effect(() => {
            const page = this.currentPage();
            const size = this.pageSize();
            const status = this.statusFilter();
            this.reloadTrigger();
            this.loadGlobalSessions(size, (page - 1) * size, status);
        });
    }

    public onPageChange(page: number): void {
        this.currentPage.set(page);
    }

    public onStatusFilterChange(values: string[]): void {
        this.statusFilter.set(values);
    }

    public onDeleteSelected(ids: number[]): void {
        if (ids.length === 0) return;

        this.graphSessionService.bulkDeleteSessions(ids).subscribe({
            next: () => {
                const remaining = this.sessions().filter((s) => !ids.includes(s.id));
                if (remaining.length === 0 && this.currentPage() > 1) {
                    this.currentPage.set(this.currentPage() - 1);
                } else {
                    this.reloadTrigger.update((val) => val + 1);
                }
            },
            error: (err) => {
                console.error('Failed to delete sessions', err);
            },
        });
    }

    private loadGlobalSessions(limit: number, offset: number, status: string[]): void {
        this.isLoaded.set(false);
        this.graphSessionService.getGlobalSessions(limit, offset, status).subscribe({
            next: (response) => {
                this.sessions.set(response.results);
                this.totalCount = response.count;
                this.isLoaded.set(true);
            },
            error: () => {
                this.totalCount = 0;
                this.sessions.set([]);
                this.isLoaded.set(true);
                this.pageSize.set(10);
                this.currentPage.set(1);
            },
        });
    }
}
