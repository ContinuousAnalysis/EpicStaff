import {
  Component,
  Inject,
  computed,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { ENTITY_ICONS, DEFAULT_ENTITY_ICON } from '../../../../shared/constants/entity-icons.constants';
import {
  ImportResult,
  ImportResultDialogData,
  EntityTypeResult,
} from '../../models/import-result.model';

@Component({
  selector: 'app-import-result-dialog',
  standalone: true,
  imports: [CommonModule, ButtonComponent, AppIconComponent],
  templateUrl: './import-result-dialog.component.html',
  styleUrls: ['./import-result-dialog.component.scss'],
})
export class ImportResultDialogComponent implements AfterViewInit {
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('summaryList') summaryListRef!: ElementRef<HTMLElement>;

  private readonly SCROLL_STEP = 240;
  private _scrollLeft = signal(0);
  private _scrollWidth = signal(0);
  private _clientWidth = signal(0);

  public canScrollLeft = computed(() => this._scrollLeft() > 0);
  public canScrollRight = computed(() => this._scrollLeft() < this._scrollWidth() - this._clientWidth() - 1);

  public importResult: ImportResult;

  // Computed signals for dynamic UI
  public totalItemsCount = computed(() => {
    let total = 0;
    Object.values(this.importResult).forEach((result) => {
      total += result.total;
    });

    return total;
  });

  public entityTypes = computed(() => {
    return Object.keys(this.importResult).sort();
  });

  constructor(
    public dialogRef: DialogRef<void>,
    @Inject(DIALOG_DATA) public data: ImportResultDialogData
  ) {
    this.importResult = data.importResult;
  }

  /**
   * Get display name for entity type (e.g., "GRAPH" -> "Flow")
   */
  public getEntityTypeLabel(entityType: string): string {
    const labelMap: { [key: string]: string } = {
      Agent: 'Agent',
      EmbeddingConfig: 'Embedding Config',
      EmbeddingModel: 'Embedding Model',
      EmbeddingModelTag: 'Embedding Model Tag',
      Flow: 'Flow',
      LLMConfig: 'LLM Config',
      LLMModel: 'LLM Model',
      LLMModelTag: 'LLM Model Tag',
      MCPTool: 'MCP Tool',
      Project: 'Project',
      PythonCodeTool: 'Python Code Tool',
      RealtimeConfig: 'Realtime Config',
      RealtimeModel: 'Realtime Model',
      RealtimeTranscriptionConfig: 'Realtime Transcription Config',
      RealtimeTranscriptionModel: 'Realtime Transcription Model',
    };

    return labelMap[entityType] || entityType;
  }

  /**
   * Get icon for entity type (e.g., "GRAPH" -> flows icon)
   */
  public getIconColorForEntityType(entityType: string): string {
    if (entityType === 'PythonCodeTool') return '#FFCF3F';
    const grayTypes = ['Flow', 'Project'];

    return grayTypes.includes(entityType) ? 'var(--gray-400)' : 'var(--accent-color)';
  }

  public getIconForEntityType(entityType: string): string {
    return ENTITY_ICONS[entityType] || DEFAULT_ENTITY_ICON;
  }

  public isInlineSvgIcon(entityType: string): boolean {
    const iconValue = this.getIconForEntityType(entityType);
    return iconValue.startsWith('<svg');
  }

  public getInlineSvgIcon(entityType: string): SafeHtml {
    const iconValue = this.getIconForEntityType(entityType);
    return this.sanitizer.bypassSecurityTrustHtml(iconValue);
  }

  /**
   * Get total count for entity type
   */
  public getEntityTypeCount(entityType: string): number {
    return this.importResult[entityType]?.total || 0;
  }

  /**
   * Get entity type result
   */
  public getEntityTypeResult(entityType: string): EntityTypeResult | undefined {
    return this.importResult[entityType];
  }

  /**
   * Get status badge style class
   */
  public getStatusClass(status: 'created' | 'reused'): string {
    return status === 'created' ? 'status-created' : 'status-reused';
  }

  /**
   * Navigate to entity details in a new tab
   */
  public navigateToEntity(entityType: string, id: number | string): void {
    const routeMap: { [key: string]: string } = {
      Flow: '/flows',
      Project: '/projects',
      Agent: '/agents',
    };

    const basePath = routeMap[entityType];
    if (basePath) {
      const urlTree = this.router.createUrlTree([basePath, id]);
      const url = this.router.serializeUrl(urlTree);
      window.open(url, '_blank');
    }
  }

  /**
   * Check if entity has navigable route
   */
  public isNavigable(entityType: string): boolean {
    const navigableTypes = ['Flow', 'Project', 'Agent'];
    return navigableTypes.includes(entityType);
  }

  public ngAfterViewInit(): void {
    this.onSummaryScroll();
  }

  public onSummaryScroll(): void {
    const el = this.summaryListRef?.nativeElement;
    if (!el) return;
    this._scrollLeft.set(el.scrollLeft);
    this._scrollWidth.set(el.scrollWidth);
    this._clientWidth.set(el.clientWidth);
  }

  public scrollSummary(direction: -1 | 1): void {
    const el = this.summaryListRef?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * this.SCROLL_STEP, behavior: 'smooth' });
  }

  /**
   * Close dialog
   */
  public closeDialog(): void {
    this.dialogRef.close();
  }
}
