import {
    ChangeDetectionStrategy,
    Component,
    inject,
    signal,
    computed,
    OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';

import { AppIconComponent } from '../../../../../shared/components/app-icon/app-icon.component';
import { LLM_Provider } from '../../../models/LLM_provider.model';
import { LLM_Model } from '../../../models/llms/LLM.model';
import { getProviderIconPath } from '../../../utils/get-provider-icon';

export interface AllModelsDialogData {
    provider: LLM_Provider;
    models: LLM_Model[];
    favoriteModelIds: Set<number>;
}

export interface AllModelsResult {
    favoriteModelIds: Set<number>;
}

@Component({
    selector: 'app-all-models-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, AppIconComponent],
    templateUrl: './all-models-modal.component.html',
    styleUrls: ['./all-models-modal.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllModelsModalComponent implements OnInit {
    private dialogRef = inject(DialogRef);
    private dialogData = inject<AllModelsDialogData>(DIALOG_DATA);

    searchQuery = signal('');
    favoriteModelIds = signal<Set<number>>(new Set());

    provider = computed(() => this.dialogData.provider);
    allModels = computed(() => this.dialogData.models);

    filteredModels = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const models = this.allModels();

        if (!query) {
            return models;
        }

        return models.filter(m => m.name.toLowerCase().includes(query));
    });

    ngOnInit(): void {
        // Initialize with existing favorites
        this.favoriteModelIds.set(new Set(this.dialogData.favoriteModelIds));
    }

    getProviderIcon(providerName: string): string {
        return getProviderIconPath(providerName);
    }

    onSearchChange(event: Event): void {
        const target = event.target as HTMLInputElement;
        this.searchQuery.set(target.value);
    }

    isModelFavorite(modelId: number): boolean {
        return this.favoriteModelIds().has(modelId);
    }

    toggleFavorite(model: LLM_Model): void {
        this.favoriteModelIds.update(ids => {
            const newIds = new Set(ids);
            if (newIds.has(model.id)) {
                newIds.delete(model.id);
            } else {
                newIds.add(model.id);
            }
            return newIds;
        });
    }

    onConfirm(): void {
        const result: AllModelsResult = {
            favoriteModelIds: this.favoriteModelIds(),
        };
        this.dialogRef.close(result);
    }

    onClose(): void {
        // Also apply changes on close
        const result: AllModelsResult = {
            favoriteModelIds: this.favoriteModelIds(),
        };
        this.dialogRef.close(result);
    }
}

