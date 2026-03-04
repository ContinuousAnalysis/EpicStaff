import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { FormGroup, FormsModule, ReactiveFormsModule } from "@angular/forms";
import {
    LlmModelSelectorComponent,
    ToggleSwitchComponent,
    ToolsSelectorComponent,
    TooltipComponent
} from "@shared/components";
import { FullLLMConfig } from "../../../../../features/settings-dialog/services/llms/full-llm-config.service";

@Component({
    selector: 'app-general-tab',
    templateUrl: './general-tab-component.html',
    styleUrls: ['../tab.component.scss'],
    imports: [
        LlmModelSelectorComponent,
        ReactiveFormsModule,
        FormsModule,
        TooltipComponent,
        ToolsSelectorComponent,
        ToggleSwitchComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GeneralTabComponent {
    form = input.required<FormGroup>();
    combinedLLMs = input.required<FullLLMConfig[]>();


    public onConfiguredToolsChange(toolConfigIds: number[]): void {
        this.form().patchValue({ configured_tools: toolConfigIds });
    }

    public onPythonToolsChange(pythonToolIds: number[]): void {
        this.form().patchValue({ python_code_tools: pythonToolIds });
    }

    public onMcpToolsChange(mcpToolIds: number[]): void {
        this.form().patchValue({ mcp_tools: mcpToolIds });
    }
}
