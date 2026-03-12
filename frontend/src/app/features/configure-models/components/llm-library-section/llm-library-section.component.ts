import { Dialog } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from '@angular/forms';
import { ConfirmationDialogData, ConfirmationDialogService, LoadingSpinnerComponent } from "@shared/components";
import { ToastService } from "../../../../services/notifications";
import { LlmLibraryModel } from "../../interfaces/llm-library-model.interface";
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';
import { LlmLibraryService } from "../../services/llm-library.service";
import { LlmConfigStorageService } from "../../services/llms/llm-config-storage.service";
import { LlmLibraryCardComponent } from '../llm-library-card/llm-library-card.component';
import { AppIconComponent } from '@shared/components';
import { LlmModelConfigDialogComponent } from "../llm-model-config-dialog/llm-model-config-dialog.component";

@Component({
    selector: 'app-llm-library-section',
    imports: [CommonModule, FormsModule, LlmLibraryCardComponent, AppIconComponent, LoadingSpinnerComponent],
    templateUrl: './llm-library-section.component.html',
    styleUrls: ['./llm-library-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LlmLibrarySectionComponent implements OnInit {
    private llmLibraryService = inject(LlmLibraryService);
    private llmConfigStorageService = inject(LlmConfigStorageService);
    private confirmationDialogService = inject(ConfirmationDialogService);
    private destroyRef = inject(DestroyRef);
    private dialog = inject(Dialog);
    private toast = inject(ToastService);

    public searchQuery = signal('');
    public selectedCapability = signal('all');
    public configsLoaded = signal<boolean>(false);

    filteredGroups = computed<LlmLibraryProviderGroup[]>(() => {
        const query = this.searchQuery().toLowerCase();
        const cap = this.selectedCapability();

        return this.providerGroups()
            .map((group) => {
                const filteredModels = group.models.filter((model) => {
                    const matchesSearch =
                        !query ||
                        model.customName.toLowerCase().includes(query) ||
                        model.modelName.toLowerCase().includes(query) ||
                        group.providerName.toLowerCase().includes(query);

                    const matchesCap =
                        cap === 'all' ||
                        model.tags.some((t) => t.toLowerCase().includes(cap.toLowerCase()));

                    return matchesSearch && matchesCap;
                });

                return { ...group, models: filteredModels };
            })
            .filter((group) => group.models.length > 0);
    });

    public providerGroups = this.llmLibraryService.providerGroups;
    public readonly capabilities: string[] = [
        'All Capabilities',
        'Embedding',
        'Realtime',
        'Voice',
        'Memory',
        'ToolsEmbedding',
        'AgentFunctionCalling',
    ];

    ngOnInit() {
        this.llmLibraryService.loadConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.configsLoaded.set(true));
    }

    public onSearchChange(value: string): void {
        this.searchQuery.set(value);
    }

    public onCapabilityChange(value: string): void {
        this.selectedCapability.set(value);
    }

    public onAddModel(): void {
        this.dialog.open(LlmModelConfigDialogComponent, {
            height: '90vh',
            width: '600px',
        })
    }

    public onEdit(configId: number): void {
        this.dialog.open(LlmModelConfigDialogComponent, {
            height: '90vh',
            width: '600px',
            data: { configId },
        });
    }

    public onDelete(model: LlmLibraryModel): void {
        const opts: ConfirmationDialogData = {
            title: 'Delete the model?',
            message: `Are you sure you want to delete the ${model.customName} model? This will delete it in all agents, tools and flows.`,
            type: 'danger',
        };

        this.confirmationDialogService.confirm(opts)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result === true) {
                    this.llmConfigStorageService.deleteConfig(model.id)
                        .subscribe({
                            next: () => this.toast.success('Configuration deleted.'),
                        });
                }
            })
    }
}

