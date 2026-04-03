import {
  Component,
  OnInit,
  Inject,
  signal,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  effect,
  ChangeDetectorRef,
} from '@angular/core';
import { GraphDto } from '../../models/graph.model';
import {
  GraphSessionLight,
  GraphSessionService,
  GraphSessionStatus,
} from '../../services/flows-sessions.service';
import { CommonModule } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { FlowSessionsTableComponent } from './flow-sessions-table.component';
import { PaginationControlsComponent, IconButtonComponent } from '@shared/components';
import { FlowSessionStatusFilterDropdownComponent } from './flow-session-status-filter-dropdown.component';
import { FlowSessionNodeFilterDropdownComponent } from './flow-session-node-filter-dropdown.component';

@Component({
  selector: 'app-flow-sessions-list',
  templateUrl: './flow-sessions-list.component.html',
  styleUrls: ['./flow-sessions-list.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IconButtonComponent,
    FlowSessionsTableComponent,
    PaginationControlsComponent,
    FlowSessionStatusFilterDropdownComponent,
    FlowSessionNodeFilterDropdownComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowSessionsListComponent implements OnInit {
  public flow!: GraphDto;
  public sessions = signal<GraphSessionLight[]>([]);
  public isLoaded = signal<boolean>(false);
  public currentPage = signal(1);
  public pageSize = signal(10);
  public statusFilter = signal<string[]>(['all']);
  public nodeFilter = signal<string | null>(null)
  public totalCount = 0;
  public availableNodes = signal<string[]>([]);
  private reloadTrigger = signal(0);

  @ViewChild('sessionSearchInput')
  sessionSearchInput!: ElementRef<HTMLInputElement>;

  constructor(
    private graphSessionService: GraphSessionService,
    @Inject(DIALOG_DATA) public data: { flow: GraphDto },
    private router: Router,
    public dialogRef: DialogRef<unknown>,
    private cdr: ChangeDetectorRef
  ) {
    this.flow = data.flow;
    console.log('flow in constructor:', JSON.stringify(this.flow));
    this.loadAvailableNodes()
    effect(() => {
      const page = this.currentPage();
      const size = this.pageSize();
      const status = this.statusFilter();
      const nodeName = this.nodeFilter();
      this.reloadTrigger();
      this.loadSessions(size, (page - 1) * size, status, nodeName);
    });
  }

  public ngOnInit(): void {
    this.currentPage.set(1);
  }

  private loadAvailableNodes(): void {
    const nodeLists = [
      this.flow?.crew_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.python_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.llm_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.file_extractor_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.webhook_trigger_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.telegram_trigger_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.end_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.subgraph_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.decision_table_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.audio_transcription_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.code_agent_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
      this.flow?.start_node_list?.map((n: any) => ({ node_name: n.node_name, id: n.id })) ?? [],
    ];

    const allNodes = nodeLists.flat()
    const nodeNames = [
      ...new Set(
        allNodes
        .filter((n: any) => n?.node_name)
        .map((n: any) => `${n.node_name} #${n.id}`)
      ),
    ]
    .map((name) => name.replace(/^__|__$/g, ''))
    .filter(Boolean)
    .sort();
    this.availableNodes.set(nodeNames);
    this.cdr.markForCheck();
    console.log("availableNodes", this.availableNodes());
    console.log("flow nodes sample", this.flow?.llm_node_list);
    console.log("first node keys", this.flow?.llm_node_list?.[0]);

  }

  private loadSessions(limit: number, offset: number, status: string[], nodeName: string | null = null): void {
    this.isLoaded.set(false);
    if (this.flow && this.flow.id) {
      this.graphSessionService
        .getSessionsByGraphId(this.flow.id, false, limit, offset, status, nodeName)
        .subscribe({
          next: (sessions) => {
            this.sessions.set(sessions.results);
            this.isLoaded.set(true);
            this.totalCount = sessions.count;
          },
          error: () => {
            this.totalCount = 0;
            this.sessions.set([]);
            this.isLoaded.set(true);
            this.pageSize.set(10);
            this.currentPage.set(1);
          },
        });
    } else {
      this.isLoaded.set(true);
    }
  }

  public onDeleteSelected(ids: number[]): void {
    if (ids.length === 0) return;

    this.graphSessionService.bulkDeleteSessions(ids).subscribe({
      next: () => {
        this.reloadAfterDeletion(ids);
        console.log('Sessions deleted successfully', ids);
      },
      error: (err) => {
        console.error('Failed to bulk delete sessions', err);
      },
    });
  }

  private reloadAfterDeletion(deletedIds: number[]): void {
    const currentSessions = this.sessions();
    const remainingSessionsOnPage = currentSessions.filter(
      (session) => !deletedIds.includes(session.id)
    );
    const currentPageNumber = this.currentPage();

    if (remainingSessionsOnPage.length === 0 && currentPageNumber > 1) {
      this.currentPage.set(currentPageNumber - 1);
    } else {
      this.reloadTrigger.update((val) => val + 1);
    }
  }

  public onViewSession(sessionId: number): void {
    this.router.navigate(['/graph', this.flow.id, 'session', sessionId]);
    this.dialogRef.close();
  }

  public onStopSession(sessionId: number): void {
    this.graphSessionService.stopSessionById(sessionId).subscribe({
      next: (response) => {
        this.sessions.update((sessions) =>
          sessions.map((s) =>
            s.id === sessionId ? { ...s, status: GraphSessionStatus.STOP } : s
          )
        );
      },
      error: (err) => {
        console.error('Failed to stop session', err);
      },
    });
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onStatusFilterChange(values: string[]) {
    this.statusFilter.set(values);
  }

  public ngOnDestroy() {
    this.sessions.set([]);
  }

  onNodeFilterChange(value: string | null) {
    this.nodeFilter.set(value);
  }
}
