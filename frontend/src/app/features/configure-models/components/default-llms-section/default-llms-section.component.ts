import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DEFAULT_LLMS_SECTIONS } from '../../constants/default-llms-sections.constant';
import { DefaultLlmsCardComponent } from '../default-llms-card/default-llms-card.component';
import { GetLlmModelRequest } from "../../../settings-dialog/models/llms/LLM.model";

@Component({
  selector: 'app-default-llms-section',
  standalone: true,
  imports: [CommonModule, DefaultLlmsCardComponent],
  templateUrl: './default-llms-section.component.html',
  styleUrls: ['./default-llms-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultLlmsSectionComponent {
  public readonly sections = DEFAULT_LLMS_SECTIONS;

  public onModelSelected(event: {
    cardId: string;
    model: GetLlmModelRequest;
  }): void {
    console.log('[Default LLMs] selected', event);
  }
}


