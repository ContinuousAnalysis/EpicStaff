import { ChangeDetectionStrategy, Component } from "@angular/core";
import { StrategyForm } from "../strategy-config-form.abstract";
import { FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { TokenStrategyModel } from "../../../../../models/strategy.model";
import { InputNumberComponent } from "@shared/components";
import { MATERIAL_FORMS } from "@shared/material-forms";

@Component({
    selector: 'app-token-form',
    templateUrl: './token-form.component.html',
    styleUrls: ['../../document-config.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        InputNumberComponent,
        MATERIAL_FORMS,
        ReactiveFormsModule
    ]
})
export class TokenFormComponent extends StrategyForm<TokenStrategyModel> {
    initializeForm(config: TokenStrategyModel): FormGroup {
        return this.fb.group({
            mainParams: this.fb.group({
                chunk_size: [config.chunk_size || 20, Validators.required],
                chunk_overlap: [config.chunk_overlap || 0, Validators.required],
            }),
            additionalParams: this.fb.group({}),
        });
    }
}
