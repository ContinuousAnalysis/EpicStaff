import {ChangeDetectionStrategy, Component} from "@angular/core";
import {TunnelsConfiguration} from "../tunnel-config.abstract";
import {NgrokTunnelConfig} from "../../../../core/models/tunnels-config.model";
import {FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {
    CustomInputComponent,
    ExpandPanelComponent, JsonEditorComponent,
    ListboxComponent,
    SelectComponent,
    ToggleSwitchComponent
} from "@shared/components";

@Component({
    selector: 'app-ngrok-config',
    templateUrl: './ngrok-config.component.html',
    styleUrls: ['../tunnel-config.scss'],
    imports: [
        ReactiveFormsModule,
        CustomInputComponent,
        SelectComponent,
        ExpandPanelComponent,
        ToggleSwitchComponent,
        ListboxComponent,
        JsonEditorComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgrokConfigComponent extends TunnelsConfiguration<NgrokTunnelConfig> {

    initializeForm(config: NgrokTunnelConfig): FormGroup {
        return this.fb.group({
            authToken: [config.authToken ?? null, Validators.required],
            region: [config.region ?? null, Validators.required],
            public_url: [config.public_url ?? null, Validators.required],
            local_port: [config.local_port ?? null, Validators.required],
            web_inspection_interface: [config.web_inspection_interface ?? null, Validators.required],
            own_domain: [config.own_domain ?? null, Validators.required],
            subdomain: [config.subdomain ?? null, Validators.required],
            local_tcp_port: [config.local_tcp_port ?? null, Validators.required],
            http_basic_auth: [config.http_basic_auth ?? null, Validators.required],
            username: [config.username ?? null, Validators.required],
            password: [config.password ?? null, Validators.required],
            ip_whitelist: [config.ip_whitelist ?? null, Validators.required],
            request_reply: [config.request_reply ?? null, Validators.required],
            logging_all_requests: [config.logging_all_requests ?? null, Validators.required],
            webhook_verification_token: [config.webhook_verification_token ?? null, Validators.required],
            custom_response_headers: [config.custom_response_headers ?? null, Validators.required],
            webhook_response_body: [config.webhook_response_body ?? null, Validators.required],
            request_transformation_rules: [config.request_transformation_rules ?? null, Validators.required],
        });
    }
}
