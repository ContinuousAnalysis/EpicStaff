import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AppSvgIconComponent, PaginationControlsComponent } from '@shared/components';

import { FlowNameFilterDropdownComponent } from '../../components/flow-sessions-dialog/flow-name-filter-dropdown.component';
import { FlowSessionsTableComponent } from '../../components/flow-sessions-dialog/flow-sessions-table.component';
import { GetGraphLightRequest } from '../../models/graph.model';
import { FlowsApiService } from '../../services/flows-api.service';
import { GraphSessionLight, GraphSessionService } from '../../services/flows-sessions.service';

@Component({
    selector: 'app-global-sessions-list',
    standalone: true,
    imports: [
        CommonModule,
        FlowSessionsTableComponent,
        FlowNameFilterDropdownComponent,
        PaginationControlsComponent,
        AppSvgIconComponent,
        RouterModule,
    ],
    template: ` <div class="global-sessions-wrapper">
        <div class="global-sessions-header">
            <div class="flows-prefix">
                <app-svg-icon icon="arrow-left" size="20px" class="back-arrow" />
                <span routerLink="/flows">Flows</span>
                <span class="slash">/All sessions</span>
            </div>
        </div>
        <div class="global-sessions-content">
            <div class="filter-controls">
                <app-flow-name-filter-dropdown
                    [flows]="availableFlows()"
                    [value]="flowFilter()"
                    (valueChange)="onFlowFilterChange($event)"
                ></app-flow-name-filter-dropdown>
                <label class="error-cause-filter">
                    <span>Show first failed</span>
                    <div class="toggle-switch" [class.active]="isErrorCauseFilter()" (click)="onIsErrorCauseChange()">
                        <div class="toggle-thumb"></div>
                    </div>
                </label>
                <button class="delete-btn" [class.invisible]="selectedIds().size === 0" (click)="onBulkDelete()">
                    Delete Selected ({{ selectedIds().size }})
                </button>
                <span [class.invisible]="selectedIds().size > 0" class="results-length">
                    {{ this.sessions().length }} Results
                </span>
            </div>
            <div class="table-container">
                <app-flow-sessions-table
                    [sessions]="sessions()"
                    [showFlowName]="true"
                    [showDuration]="true"
                    [sortable]="true"
                    [sortOrder]="sortOrder()"
                    [statusFilter]="statusFilter()"
                    [isLoading]="!isLoaded()"
                    [showEmptyState]="isLoaded() && sessions().length === 0"
                    (deleteSelected)="onDeleteSelected($event)"
                    (viewSession)="onViewSession($event)"
                    (sortChange)="onSortChange($event)"
                    (statusFilterChange)="onStatusFilterChange($event)"
                    (selectedIdsChange)="selectedIds.set($event)"
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
    styleUrls: ['./global-sessions-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSessionsListComponent implements OnInit {
    public sessions = signal<GraphSessionLight[]>([]);
    public isLoaded = signal<boolean>(false);
    public currentPage = signal(1);
    public pageSize = signal(10);
    public statusFilter = signal<string[]>(['all']);
    public sortOrder = signal<'asc' | 'desc'>('desc');
    public flowFilter = signal<string | null>(null);
    public isErrorCauseFilter = signal<boolean>(false);
    public selectedIds = signal<Set<number>>(new Set());
    public availableFlows = signal<GetGraphLightRequest[]>([]);
    public totalCount = 0;
    private reloadTrigger = signal(0);

    constructor(
        private graphSessionService: GraphSessionService,
        private flowsApiService: FlowsApiService,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) {
        effect(() => {
            const page = this.currentPage();
            const size = this.pageSize();
            const status = this.statusFilter();
            const sort = this.sortOrder();
            const flowName = this.flowFilter();
            const isErrorCause = this.isErrorCauseFilter();
            this.reloadTrigger();
            this.loadGlobalSessions(size, (page - 1) * size, status, sort, flowName, isErrorCause);
        });
    }

    public ngOnInit(): void {
        this.flowsApiService.getGraphsLight().subscribe({
            next: (flows) => {
                this.availableFlows.set(flows);
                this.cdr.markForCheck();
            },
        });
    }

    public onPageChange(page: number): void {
        this.currentPage.set(page);
    }

    public onViewSession(sessionId: number): void {
        const session = this.sessions().find((s) => s.id === sessionId);
        if (session) {
            this.router.navigate(['/graph', session.graph_id, 'session', sessionId]);
        }
    }

    public onIsErrorCauseChange(): void {
        this.isErrorCauseFilter.update((v) => !v);
        this.currentPage.set(1);
    }

    public onFlowFilterChange(name: string | null): void {
        this.flowFilter.set(name);
        this.currentPage.set(1);
    }

    public onBulkDelete(): void {
        this.onDeleteSelected(Array.from(this.selectedIds()));
        this.selectedIds.set(new Set());
    }

    public onStatusFilterChange(values: string[]): void {
        this.statusFilter.set(values);
        this.currentPage.set(1);
    }

    public onSortChange(order: 'asc' | 'desc'): void {
        this.sortOrder.set(order);
        this.currentPage.set(1);
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

    private loadGlobalSessions(
        limit: number,
        offset: number,
        status: string[],
        sort: 'asc' | 'desc' = 'desc',
        graphName?: string | null,
        isErrorCause?: boolean
    ): void {
        this.isLoaded.set(false);
        const ordering = sort === 'asc' ? 'created_at' : '-created_at';
        this.graphSessionService.getGlobalSessions(limit, offset, status, ordering, graphName, isErrorCause).subscribe({
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
