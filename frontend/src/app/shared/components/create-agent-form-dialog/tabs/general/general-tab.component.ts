import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { LlmModelSelectorComponent, TooltipComponent } from "@shared/components";
import { FullLLMConfig } from "../../../../../features/settings-dialog/services/llms/full-llm-config.service";

@Component({
    selector: 'app-general-tab',
    templateUrl: './general-tab-component.html',
    styleUrls: ['../tab.component.scss'],
    imports: [
        LlmModelSelectorComponent,
        ReactiveFormsModule,
        FormsModule,
        TooltipComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneralTabComponent {
    form = input.required<FormGroup>();
    combinedLLMs = input.required<FullLLMConfig[]>();
}
