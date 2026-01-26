import {ChangeDetectionStrategy, Component} from "@angular/core";
import {StrategyForm} from "../strategy-config-form.abstract";
import {FormGroup} from "@angular/forms";
import {JsonStrategyModel} from "../../../../../models/strategy.model";
import {InputNumberComponent} from "@shared/components";
import {MATERIAL_FORMS} from "@shared/material-forms";

@Component({
    selector: 'app-json-form',
    templateUrl: './json-form.component.html',
    styleUrls: ['../../document-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        InputNumberComponent,
        MATERIAL_FORMS
    ]
})
export class JsonFormComponent extends StrategyForm<JsonStrategyModel> {
    initializeForm(config: JsonStrategyModel): FormGroup {
        return this.fb.group({});
    }
}
