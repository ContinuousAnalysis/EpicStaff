import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppIconComponent } from '@shared/components';
import { DefaultLlmsCard } from '../../interfaces/default-llms-card.interface';
import { LlmConfigStorageService } from '../../services/llms/llm-config-storage.service';
import { GetLlmConfigRequest } from '@shared/models';

@Component({
    selector: 'app-default-llms-card',
    imports: [CommonModule, AppIconComponent],
    templateUrl: './default-llms-card.component.html',
    styleUrls: ['./default-llms-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultLlmsCardComponent {
    private readonly llmConfigStorageService = inject(LlmConfigStorageService);

    public readonly card = input.required<DefaultLlmsCard>();
    public readonly selectedConfigId = input<number | null>(null);
    public readonly modelSelected = output<{ cardId: string; configId: number | null }>();

    public readonly isDropdownOpen = signal(false);

    public readonly configs = this.llmConfigStorageService.configs;

    public readonly selectedConfig = computed<GetLlmConfigRequest | null>(() => {
        const id = this.selectedConfigId();
        if (id == null) return null;
        return this.configs().find(c => c.id === id) ?? null;
    });

    public toggleDropdown(): void {
        this.isDropdownOpen.update(v => !v);
    }

    public selectConfig(config: GetLlmConfigRequest): void {
        this.modelSelected.emit({ cardId: this.card().id, configId: config.id });
        this.isDropdownOpen.set(false);
    }

    public onResetConfig(): void {
        this.modelSelected.emit({ cardId: this.card().id, configId: null });
        this.isDropdownOpen.set(false);
    }
}
