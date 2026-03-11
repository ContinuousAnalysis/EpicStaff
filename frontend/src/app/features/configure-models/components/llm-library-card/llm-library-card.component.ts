import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LlmLibraryModel } from '../../interfaces/llm-library-model.interface';

@Component({
    selector: 'app-llm-library-card',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './llm-library-card.component.html',
    styleUrls: ['./llm-library-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LlmLibraryCardComponent {
    public readonly model = input.required<LlmLibraryModel>();

    public readonly editClick = output<string>();
    public readonly deleteClick = output<LlmLibraryModel>();

    public get isUsed(): boolean {
        return this.model().usedByCount !== null;
    }

    public onEdit(): void {
        this.editClick.emit(this.model().id);
    }

    public onDelete(): void {
        this.deleteClick.emit(this.model());
    }
}

