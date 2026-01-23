import {ChangeDetectionStrategy, Component} from "@angular/core";
import {TunnelsConfiguration} from "../tunnel-config.abstract";
import {LocalhostTunnelConfig} from "../../../../core/models/tunnels-config.model";
import {FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {
    CustomInputComponent,
    ExpandPanelComponent,
    InputNumberComponent, ListboxComponent,
    ToggleSwitchComponent
} from "@shared/components";
import {RadioButtonComponent} from "../../../../../shared/components/radio-button/radio-button.component";

@Component({
    selector: 'app-localhost-config',
    templateUrl: './localhost-config.component.html',
    styleUrls: ['../tunnel-config.scss'],
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        RadioButtonComponent,
        InputNumberComponent,
        ExpandPanelComponent,
        ToggleSwitchComponent,
        ListboxComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocalhostConfigComponent extends TunnelsConfiguration<LocalhostTunnelConfig> {

    initializeForm(config: LocalhostTunnelConfig): FormGroup {
        return this.fb.group({
            full_url: [config.full_url ?? null, Validators.required],
            protocol: [config.protocol ?? null, Validators.required],
            timeout: [config.timeout ?? null, Validators.required],
            port_settings: [config.port_settings ?? null, Validators.required],
            enable_cors: [config.enable_cors ?? false],
            permitted_origins: [config.permitted_origins ?? null],
        });
    }
}
