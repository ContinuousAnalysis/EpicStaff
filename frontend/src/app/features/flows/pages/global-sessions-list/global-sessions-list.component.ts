import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    effect,
    ElementRef,
    HostListener,
    inject,
    signal,
    ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { AppSvgIconComponent, PaginationControlsComponent } from '@shared/components';
import { Subject, takeUntil } from 'rxjs';
import { GraphMessagesComponent } from 'src/app/pages/running-graph/components/graph-messages/graph-messages.component';

import { FlowSessionsTableComponent } from '../../components/flow-sessions-dialog/flow-sessions-table.component';
import { GetGraphLightRequest } from '../../models/graph.model';
import { FlowsApiService } from '../../services/flows-api.service';
import { GraphSessionLight, GraphSessionService, GraphSessionStatus } from '../../services/flows-sessions.service';

@Component({
    selector: 'app-global-sessions-list',
    standalone: true,
    imports: [
        CommonModule,
        FlowSessionsTableComponent,
        PaginationControlsComponent,
        AppSvgIconComponent,
        RouterModule,
        GraphMessagesComponent,
    ],
    template: `<div class="global-sessions-wrapper">
        <div class="global-sessions-header">
            <div class="flows-prefix">
                <app-svg-icon
                    icon="arrow-left"
                    size="20px"
                    class="back-arrow"
                />
                <span routerLink="/flows">Flows</span>
                <span class="slash">/All sessions</span>
            </div>
        </div>
        <div
            class="global-sessions-content"
            #contentRef
        >
            <!-- LEFT PANEL: filters + table + pagination -->
            <div class="left-panel">
                <div class="filter-controls">
                    <button
                        class="delete-btn"
                        [class.invisible]="selectedIds().size === 0"
                        (click)="onBulkDelete()"
                    >
                        Delete Selected ({{ selectedIds().size }})
                    </button>
                    <span
                        [class.invisible]="selectedIds().size > 0"
                        class="results-length"
                    >
                        {{ totalCount() }} Results
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
                        [flows]="availableFlows()"
                        [flowNameFilter]="flowFilter()"
                        (flowNameFilterChange)="onFlowFilterChange($event)"
                        [isLoading]="!isLoaded()"
                        [showEmptyState]="isLoaded() && sessions().length === 0"
                        [externalPreview]="true"
                        (deleteSelected)="onDeleteSelected($event)"
                        (viewSession)="onViewSession($event)"
                        (stopSession)="onStopSession($event)"
                        (sortChange)="onSortChange($event)"
                        (statusFilterChange)="onStatusFilterChange($event)"
                        (selectedIdsChange)="selectedIds.set($event)"
                        (previewSession)="onPreviewSession($event)"
                    ></app-flow-sessions-table>
                </div>
                @if (isLoaded() && totalCount() > pageSize()) {
                    <div class="pagination-container">
                        <app-pagination-controls
                            [pageSize]="pageSize()"
                            [totalCount]="totalCount()"
                            [currentPage]="currentPage()"
                            [maxPagesToShow]="5"
                            (pageChange)="onPageChange($event)"
                        ></app-pagination-controls>
                    </div>
                }
            </div>

            <div
                class="panel-divider"
                [class.panel-divider--open]="isPanelOpen()"
                (mousedown)="isPanelOpen() && startResize($event)"
            >
                <button
                    class="panel-toggle-btn"
                    (click)="togglePanel(); $event.stopPropagation()"
                    [title]="isPanelOpen() ? 'Close panel' : 'Open panel'"
                >
                    <app-svg-icon
                        [icon]="isPanelOpen() ? 'arrow-right' : 'arrow-left'"
                        size="12px"
                    >
                    </app-svg-icon>
                </button>
            </div>

            <!-- RIGHT PANEL: session details -->
            <div
                class="right-panel"
                [class.right-panel--open]="isPanelOpen()"
                [style.width]="isPanelOpen() ? rightPanelWidth() + '%' : '0'"
            >
                @if (previewSession(); as session) {
                    <div class="preview-header">
                        <div class="preview-header-left">
                            <div class="preview-header-icon">
                                <app-svg-icon
                                    icon="heartbeat"
                                    size="18px"
                                />
                            </div>
                            <span class="preview-header-title">Session execution</span>
                        </div>
                        <div class="preview-header-right">
                            <span class="preview-session-id-badge">#{{ session.id }}</span>
                            <button
                                class="preview-open-btn"
                                (click)="onViewSession(session.id)"
                                title="Open session"
                            >
                                <app-svg-icon
                                    icon="arrow-up-right"
                                    size="16px"
                                />
                            </button>
                        </div>
                    </div>
                    <div class="preview-body">
                        <app-graph-messages
                            [graphId]="session.graph_id"
                            [sessionId]="session.id.toString()"
                            [compact]="true"
                        ></app-graph-messages>
                    </div>
                } @else {
                    <div class="preview-empty">
                        <span>Click Preview to view session details</span>
                    </div>
                }
            </div>
        </div>
    </div>`,
    styleUrls: ['./global-sessions-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSessionsListComponent {
    @ViewChild('contentRef') contentRef!: ElementRef<HTMLElement>;

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
    public totalCount = signal(0);
    public isPanelOpen = signal(false);
    public rightPanelWidth = signal(35);
    private isResizing = false;
    private resizeStartX = 0;
    private resizeStartWidth = 0;
    public previewSession = signal<GraphSessionLight | null>(null);
    private reloadTrigger = signal(0);
    private cancelLoad$ = new Subject<void>();
    private destroyRef = inject(DestroyRef);

    constructor(
        private graphSessionService: GraphSessionService,
        private flowsApiService: FlowsApiService,
        private router: Router
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

        this.flowsApiService
            .getGraphsLight()
            .pipe(takeUntilDestroyed())
            .subscribe({
                next: (flows) => {
                    this.availableFlows.set(flows);
                },
            });
    }

    public togglePanel(): void {
        this.isPanelOpen.update((v) => !v);
    }

    public startResize(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isResizing = true;
        this.resizeStartX = event.clientX;
        this.resizeStartWidth = this.rightPanelWidth();
    }

    @HostListener('document:mousemove', ['$event'])
    public onMouseMove(event: MouseEvent): void {
        if (!this.isResizing) return;
        const containerWidth = this.contentRef.nativeElement.getBoundingClientRect().width;
        const dx = this.resizeStartX - event.clientX;
        const dxPercent = (dx / containerWidth) * 100;
        const newWidth = Math.min(60, Math.max(15, this.resizeStartWidth + dxPercent));
        this.rightPanelWidth.set(newWidth);
    }

    @HostListener('document:mouseup')
    public onMouseUp(): void {
        this.isResizing = false;
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

    public onPreviewSession(sessionId: number | null): void {
        if (sessionId === null) {
            this.previewSession.set(null);
            return;
        }
        const session = this.sessions().find((s) => s.id === sessionId) ?? null;
        this.previewSession.set(session);
        if (session) {
            this.isPanelOpen.set(true);
        }
    }

    public onStopSession(sessionId: number): void {
        this.graphSessionService
            .stopSessionById(sessionId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.sessions.update((list) =>
                        list.map((s) =>
                            s.id === sessionId
                                ? { ...s, status: GraphSessionStatus.STOP, finished_at: new Date().toISOString() }
                                : s
                        )
                    );
                },
                error: (err) => {
                    console.error('Failed to stop session', err);
                },
            });
    }

    public onDeleteSelected(ids: number[]): void {
        if (ids.length === 0) return;

        this.graphSessionService
            .bulkDeleteSessions(ids)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
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
        this.cancelLoad$.next();
        this.isLoaded.set(false);
        const ordering = sort === 'asc' ? 'created_at' : '-created_at';
        this.graphSessionService
            .getGlobalSessions(limit, offset, status, ordering, graphName, isErrorCause)
            .pipe(takeUntil(this.cancelLoad$), takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (response) => {
                    this.sessions.set(response.results);
                    this.totalCount.set(response.count);
                    this.isLoaded.set(true);
                },
                error: () => {
                    this.totalCount.set(0);
                    this.sessions.set([]);
                    this.isLoaded.set(true);
                    this.pageSize.set(10);
                    this.currentPage.set(1);
                },
            });
    }
}
