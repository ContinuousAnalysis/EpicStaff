import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DefaultLlmsCard } from '../../interfaces/default-llms-card.interface';
import { LLM_Models_Service } from '../../../../services/LLM_models.service';
import { GetLlmModelRequest } from '../../../../shared/models/LLM.model';
import { take, tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-default-llms-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './default-llms-card.component.html',
  styleUrls: ['./default-llms-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultLlmsCardComponent {
  public readonly card = input.required<DefaultLlmsCard>();
  public readonly modelSelected = output<{
    cardId: string;
    model: GetLlmModelRequest;
  }>();

  private readonly llmModelsService = inject(LLM_Models_Service);

  public readonly isDropdownOpen = signal(false);
  public readonly isLoading = signal(false);

  public readonly models = signal<GetLlmModelRequest[]>([]);
  public readonly selectedModel = signal<GetLlmModelRequest | null>(null);

  public toggleDropdown(): void {
    const nextState = !this.isDropdownOpen();
    this.isDropdownOpen.set(nextState);

    //TODO: Refactor this to use a proper loading state
    if (nextState && this.models().length === 0) {
      this.loadModels();
    }
  }

  public selectModel(model: GetLlmModelRequest): void {
    this.selectedModel.set(model);
    this.modelSelected.emit({ cardId: this.card().id, model });
    this.isDropdownOpen.set(false);
  }

  private loadModels(): void {
    this.isLoading.set(true);
    this.llmModelsService
      .getLLMModels()
      .pipe(
        take(1),
        tap((models) => {
          this.models.set(models);
          this.isLoading.set(false);
        }),
        catchError(() => {
          this.isLoading.set(false);
          return of([]);
        })
      )
      .subscribe();
  }
}


