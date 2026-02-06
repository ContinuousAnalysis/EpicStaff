import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LLM_LIBRARY_MOCK_DATA } from '../../constants/llm-library-mock-data.constant';
import { LlmLibraryProviderGroup } from '../../interfaces/llm-library-provider-group.interface';
import { LlmLibraryCardComponent } from '../llm-library-card/llm-library-card.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';

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
    console.log('[LLM Library] Add model');
  }

  public onHistory(modelId: string): void {
    console.log('[LLM Library] History:', modelId);
  }

  public onEdit(modelId: string): void {
    console.log('[LLM Library] Edit:', modelId);
  }

  public onDelete(modelId: string): void {
    console.log('[LLM Library] Delete:', modelId);
  }
}

