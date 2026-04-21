import { NgFor, NgIf } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppSvgIconComponent } from '@shared/components';
import { FullLLMConfig, FullLLMConfigService } from '@shared/services';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MergedConfig } from '../../../../../features/staff/services/full-agent.service';
import { LlmItemComponent } from './llm-item/llm-item.component';

@Component({
    selector: 'app-llm-popup',
    imports: [NgFor, FormsModule, NgIf, LlmItemComponent, AppSvgIconComponent],
    templateUrl: './llm-popup.component.html',
    styleUrls: ['./llm-popup.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LLMPopupComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
    @Input() public cellValue: MergedConfig[] = [];
    @Output() public configsSelected = new EventEmitter<MergedConfig[]>();
    @Output() public cancel = new EventEmitter<void>();

    @ViewChild('searchInput') private searchInput!: ElementRef;

    public searchTerm: string = '';
    public loading: boolean = true;

    public llmConfigs: FullLLMConfig[] = [];
    public selectedLLMId: number | null = null;
    public selectedLLM: FullLLMConfig | null = null;

    private _filteredLLMs: MergedConfig[] = [];
    private _lastSearchTerm: string = '';

    private readonly destroyed$ = new Subject<void>();

    constructor(
        private readonly fullLLMConfigService: FullLLMConfigService,
        private readonly cdr: ChangeDetectorRef
    ) {}

    public ngOnInit(): void {
        this.loadConfigs();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['cellValue']) {
            this.preSelectConfigs();
        }
    }

    public ngAfterViewInit(): void {
        if (this.searchInput) {
            this.searchInput.nativeElement.focus();
        }
        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    public ngOnDestroy(): void {
        this.destroyed$.next();
        this.destroyed$.complete();
    }

    private loadConfigs(): void {
        this.loading = true;
        this.cdr.markForCheck();

        this.fullLLMConfigService
            .getFullLLMConfigs()
            .pipe(takeUntil(this.destroyed$))
            .subscribe({
                next: (llmConfigs) => {
                    this.llmConfigs = llmConfigs;
                    this._filteredLLMs = [];
                    this.preSelectConfigs();
                    this.loading = false;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    console.error('Error fetching LLM configurations:', err);
                    this.loading = false;
                    this.cdr.markForCheck();
                },
            });
    }

    private preSelectConfigs(): void {
        if (!this.cellValue?.length) return;
        const llmConfig = this.cellValue.find((c) => c.type === 'llm');
        if (llmConfig) {
            const matched = this.llmConfigs.find((c) => c.id === llmConfig.id);
            if (matched) {
                this.selectedLLMId = matched.id;
                this.selectedLLM = matched;
            }
        }
        this.cdr.markForCheck();
    }

    public get filteredLLMs(): MergedConfig[] {
        if (this._lastSearchTerm !== this.searchTerm || this._filteredLLMs.length === 0) {
            this._lastSearchTerm = this.searchTerm;

            if (!this.llmConfigs?.length) {
                this._filteredLLMs = [];
                return this._filteredLLMs;
            }

            const configs: MergedConfig[] = this.llmConfigs.map((config) => ({
                id: config.id,
                custom_name: config.custom_name,
                model_name: config.modelDetails?.name || 'Unknown Model',
                type: 'llm' as const,
                provider_id: config.modelDetails?.llm_provider,
                provider_name: config.providerDetails?.name || 'Unknown Provider',
            }));

            if (!this.searchTerm) {
                this._filteredLLMs = configs;
            } else {
                const search = this.searchTerm.toLowerCase();
                this._filteredLLMs = configs.filter(
                    (c) =>
                        c.model_name.toLowerCase().includes(search) ||
                        (c.custom_name || '').toLowerCase().includes(search)
                );
            }
        }
        return this._filteredLLMs;
    }

    public onSelectLLM(item: MergedConfig): void {
        if (this.selectedLLMId === item.id) {
            this.selectedLLMId = null;
            this.selectedLLM = null;
        } else {
            this.selectedLLMId = item.id;
            this.selectedLLM = this.llmConfigs.find((c) => c.id === item.id) ?? null;
        }
        this.cdr.detectChanges();
    }

    public onSave(): void {
        const selectedConfigs: MergedConfig[] = [];
        if (this.selectedLLM) {
            selectedConfigs.push({
                id: this.selectedLLM.id,
                custom_name: this.selectedLLM.custom_name,
                model_name: this.selectedLLM.modelDetails?.name || 'Unknown Model',
                type: 'llm',
                provider_id: this.selectedLLM.modelDetails?.llm_provider,
                provider_name: this.selectedLLM.providerDetails?.name || 'Unknown Provider',
            });
        }
        this.configsSelected.emit(selectedConfigs);
    }

    public onCancel(): void {
        this.cancel.emit();
    }
}
