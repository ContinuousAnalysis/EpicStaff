import { Dialog } from "@angular/cdk/dialog";
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from '@angular/forms';
import { ConfirmationDialogData, ConfirmationDialogService } from "@shared/components";
import { LLM_LIBRARY_MOCK_DATA } from '../../constants/llm-library-mock-data.constant';
import { LlmLibraryModel } from "../../interfaces/llm-library-model.interface";
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';
import { LlmLibraryCardComponent } from '../llm-library-card/llm-library-card.component';
import { AppIconComponent } from '@shared/components';
import { LlmModelConfigDialogComponent } from "../llm-model-config-dialog/llm-model-config-dialog.component";

@Component({
    selector: 'app-llm-library-section',
    standalone: true,
    imports: [CommonModule, FormsModule, LlmLibraryCardComponent, AppIconComponent],
    templateUrl: './llm-library-section.component.html',
    styleUrls: ['./llm-library-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LlmLibrarySectionComponent {
    public readonly providerGroups: LlmLibraryProviderGroup[] = LLM_LIBRARY_MOCK_DATA;

    private readonly confirmationDialogService = inject(ConfirmationDialogService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly dialog = inject(Dialog);

    public readonly searchQuery = signal('');
    public readonly selectedCapability = signal('all');

    public readonly capabilities: string[] = [
        'All Capabilities',
        'Embedding',
        'Realtime',
        'Voice',
        'Memory',
        'ToolsEmbedding',
        'AgentFunctionCalling',
    ];

    public get filteredGroups(): LlmLibraryProviderGroup[] {
        const query = this.searchQuery().toLowerCase();
        const cap = this.selectedCapability();

        return this.providerGroups
            .map((group) => {
                const filteredModels = group.models.filter((model) => {
                    const matchesSearch =
                        !query ||
                        model.name.toLowerCase().includes(query) ||
                        group.providerName.toLowerCase().includes(query);

                    const matchesCap =
                        cap === 'all' ||
                        model.tags.some((t) => t.toLowerCase().includes(cap.toLowerCase()));

                    return matchesSearch && matchesCap;
                });

                return { ...group, models: filteredModels };
            })
            .filter((group) => group.models.length > 0);
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


    public onEdit(modelId: string): void {
        console.log('[LLM Library] Edit:', modelId);
    }

    public onDelete(model: LlmLibraryModel): void {
        const opts: ConfirmationDialogData = {
            title: 'Delete the model?',
            message: `Are you sure you want to delete the ${model.name} model? This will delete it in all agents, tools and flows.`,
            type: 'danger',
        };

        this.confirmationDialogService.confirm(opts)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((result) => {
                if (result === true) {
                    console.log('[LLM Library] Delete:', model);
                }
            })
    }
}

