import {ChangeDetectionStrategy, Component} from "@angular/core";
import {StrategyForm} from "../strategy-config-form.abstract";
import {FormGroup} from "@angular/forms";
import {HtmlStrategyModel} from "../../../../../models/strategy.model";
import {CustomInputComponent, InputNumberComponent, ToggleSwitchComponent} from "@shared/components";
import {MATERIAL_FORMS} from "@shared/material-forms";

@Component({
    selector: 'app-html-form',
    templateUrl: './html-form.component.html',
    styleUrls: ['../../document-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ToggleSwitchComponent,
        MATERIAL_FORMS,
        CustomInputComponent,
        InputNumberComponent
    ]
})
export class HtmlFormComponent extends StrategyForm<HtmlStrategyModel> {
    initializeForm(config: HtmlStrategyModel): FormGroup {
        return this.fb.group({});
    }
}
