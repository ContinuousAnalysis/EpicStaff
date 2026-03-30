import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnDestroy,
    OnInit,
    signal,
    inject,
} from '@angular/core';
import {
    GraphDto,
    CreateGraphDtoRequest,
    UpdateGraphDtoRequest,
} from '../../models/graph.model';
import { FlowsApiService } from '../../services/flows-api.service';
import {
    Router,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
} from '@angular/router';

import { CreateFlowDialogComponent } from '../../components/create-flow-dialog/create-flow-dialog.component';
import { ImportResultDialogComponent } from '../../components/import-result-dialog/import-result-dialog.component';
import { ImportResult, EntityTypeResult, ImportResultItem } from '../../models/import-result.model';

import { Dialog } from '@angular/cdk/dialog';

import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { TabButtonComponent } from '../../../../shared/components/tab-button/tab-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import {
    FiltersListComponent,
    SearchFilterChange,
} from '../../../../shared/components/filters-list/filters-list.component';
import { FlowsStorageService } from '../../services/flows-storage.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ImportExportService } from '../../../../core/services/import-export.service';
import { FlowService } from '../../../../visual-programming/services/flow.service';
import { ToastService } from '../../../../services/notifications/toast.service';

@Component({
    selector: 'app-flows-list-page',
    standalone: true,
    templateUrl: './flows-list-page.component.html',
    styleUrls: ['./flows-list-page.component.scss'],
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        ButtonComponent,
        TabButtonComponent,
        FormsModule,
        AppIconComponent,
        ImportResultDialogComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowsListPageComponent implements OnDestroy {
    public tabs = [
        { label: 'My Flows', link: 'my' },
        { label: 'Templates', link: 'templates' },
    ];

    public searchTerm: string = '';
    private searchTerms = new Subject<string>();
    private subscription: Subscription;

    private dialog = inject(Dialog);
    private flowStorageService = inject(FlowsStorageService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private importExportService = inject(ImportExportService);
    private toastService = inject(ToastService);

    public selectMode = this.flowStorageService.selectMode;
    public selectedFlowIds = this.flowStorageService.selectedFlowIds;

    constructor() {
        this.subscription = this.searchTerms
            .pipe(debounceTime(300), distinctUntilChanged())
            .subscribe((term) => {
                this.updateSearch(term);
            });
    }

    ngOnDestroy(): void {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }

        this.searchTerm = '';
        this.flowStorageService.setFilter(null);
        this.flowStorageService.setSelectMode(false);
    }

    public onSearchTermChange(term: string): void {
        this.searchTerms.next(term);
    }

    public clearSearch(): void {
        this.searchTerm = '';
        this.updateSearch('');
    }

    private updateSearch(searchTerm: string): void {
        const filter: SearchFilterChange = {
            searchTerm,
        };
        this.flowStorageService.setFilter(filter);
        this.cdr.markForCheck();
    }

    public openCreateFlowDialog(): void {
        const dialogRef = this.dialog.open<GraphDto | undefined>(
            CreateFlowDialogComponent,
            {
                width: '500px',
            }
        );

        dialogRef.closed.subscribe((result: GraphDto | undefined) => {
            if (result) {
                this.router.navigate(['/flows', result.id]);
            }
        });
    }

    private readonly ENTITY_FILE_FIELDS: Record<string, string[]> = {
        Flow:           ['description', 'time_to_live', 'persistent_variables'],
        Project:        ['description', 'process', 'memory', 'max_rpm', 'planning'],
        Agent:          ['goal', 'backstory', 'max_iter', 'memory', 'allow_delegation', 'allow_code_execution'],
        LLMModel:       ['provider_name', 'predefined', 'is_custom', 'description'],
        LLMConfig:      ['custom_name', 'temperature', 'max_tokens', 'timeout'],
        PythonCodeTool: ['description'],
        MCPTool:        ['description'],
        RealtimeModel:  ['provider_name', 'is_custom'],
        RealtimeConfig: ['custom_name'],
    };

    public onImportClick(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event: Event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            file.text().then((text: string) => {
                let fileData: Record<string, Record<string, unknown>[]> = {};
                try { fileData = JSON.parse(text); } catch {}

                this.importExportService.importFlow(file).subscribe({
                    next: (result: ImportResult) => {
                        const enriched = this._enrichImportResult(result, fileData);

                        this.dialog.open(ImportResultDialogComponent, {
                            width: '80vw',
                            data: { importResult: enriched },
                        });

                        this.flowStorageService.getFlows(true).subscribe(() => {});
                    },
                    error: (error) => {
                        const message = error?.error?.detail || error?.error?.message || 'Failed to import flow. Please check the file and try again.';
                        this.toastService.error(message);
                    },
                });
            });
        };
        input.click();
    }

    // Per entity type: which field in the file serves as the display name
    // (used as fallback when id doesn't match, e.g. for newly created entities)
    private readonly ENTITY_NAME_KEY: Record<string, string> = {
        Agent:          'role',
        LLMConfig:      'custom_name',
        RealtimeConfig: 'custom_name',
    };

    private _enrichImportResult(result: ImportResult, fileData: Record<string, Record<string, unknown>[]>): ImportResult {
        const enriched: ImportResult = {};

        for (const [entityType, entityResult] of Object.entries(result) as [string, EntityTypeResult][]) {
            const fields = this.ENTITY_FILE_FIELDS[entityType];
            const fileEntities: Record<string, unknown>[] | undefined = fileData[entityType];

            if (!fields || !fileEntities) {
                enriched[entityType] = entityResult;
                continue;
            }

            const nameKey = this.ENTITY_NAME_KEY[entityType] ?? 'name';
            const lookupById   = new Map<number | string, Record<string, unknown>>(
                fileEntities.map((e) => [e['id'] as number | string, e])
            );
            const lookupByName = new Map<string, Record<string, unknown>>(
                fileEntities.map((e) => [String(e[nameKey] ?? ''), e])
            );

            const enrichItems = (items: ImportResultItem[]) =>
                items.map((item) => {
                    const baseName = item.name.replace(/\s*\(\d+\)$/, '').trim();
                    const source = lookupById.get(item.id) ?? lookupByName.get(baseName);
                    if (!source) return item;
                    const extra: Record<string, unknown> = {};
                    for (const field of fields) {
                        const val = source[field];
                        if (val !== undefined) extra[field] = val;
                    }
                    return { ...item, ...extra };
                });

            enriched[entityType] = {
                ...entityResult,
                created: { ...entityResult.created, items: enrichItems(entityResult.created.items) },
                reused:  { ...entityResult.reused,  items: enrichItems(entityResult.reused.items)  },
            };
        }

        return enriched;
    }

    public onExportClick(): void {
        this.flowStorageService.setSelectMode(true);
    }

    public cancelExport(): void {
        this.flowStorageService.setSelectMode(false);
    }

    public confirmExport(): void {
        const ids = this.selectedFlowIds();
        if (ids.length === 0) {
            return;
        }

        this.importExportService.bulkExportFlow( ids ).subscribe({
            next: (blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `flows_export_${Date.now()}.json`;
                a.click();
                window.URL.revokeObjectURL(url);

                this.flowStorageService.setSelectMode(false);
            },
            error: (error) => {
                console.error('Bulk export failed:', error);
            }
        });
    }

    public selectAllFlows(): void {
        this.flowStorageService.toggleSelectAllFlows();
    }

    public isAllSelected(): boolean {
        return this.flowStorageService.isAllFlowsSelected();
    }
}
