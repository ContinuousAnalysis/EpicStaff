import {ChangeDetectionStrategy, Component} from "@angular/core";
import {StrategyForm} from "../strategy-config-form.abstract";
import {FormGroup} from "@angular/forms";
import {CustomInputComponent, InputNumberComponent} from "@shared/components";
import {MATERIAL_FORMS} from "@shared/material-forms";
import {CharacterStrategyModel} from "../../../../../models/strategy.model";

@Component({
    selector: 'app-character-form',
    templateUrl: './character-form.component.html',
    styleUrls: ['../../document-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CustomInputComponent,
        MATERIAL_FORMS,
        InputNumberComponent
    ]
})
export class CharacterFormComponent extends StrategyForm<CharacterStrategyModel> {
    initializeForm(config: CharacterStrategyModel): FormGroup {
        return this.fb.group({});
    }
}
