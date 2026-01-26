import {ChangeDetectionStrategy, Component} from "@angular/core";
import {StrategyForm} from "../strategy-config-form.abstract";
import {FormGroup} from "@angular/forms";
import {ChipsInputComponent, InputNumberComponent, SelectItem, ToggleSwitchComponent} from "@shared/components";
import {MATERIAL_FORMS} from "@shared/material-forms";
import {MarkdownStrategyModel} from "../../../../../models/strategy.model";

@Component({
    selector: 'app-markdown-form',
    templateUrl: './markdown-form.component.html',
    styleUrls: ['../../document-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ChipsInputComponent,
        ToggleSwitchComponent,
        MATERIAL_FORMS,
        InputNumberComponent
    ]
})
export class MarkdownFormComponent extends StrategyForm<MarkdownStrategyModel> {
    headerItems: SelectItem[] = [
        {
            name: '#header 1',
            value: '1'
        },
        {
            name: '##header 2',
            value: '2'
        },
        {
            name: '###header 3',
            value: '3'
        },
    ]

    initializeForm(config: MarkdownStrategyModel): FormGroup {
        return this.fb.group({});
    }

    onToggle(value: boolean) {

    }
}
