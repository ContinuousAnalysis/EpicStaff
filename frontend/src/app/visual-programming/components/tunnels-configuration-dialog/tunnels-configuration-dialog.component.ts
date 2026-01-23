import {ChangeDetectionStrategy, Component, inject} from "@angular/core";
import {DIALOG_DATA, DialogRef} from "@angular/cdk/dialog";
import {
    AppIconComponent, ButtonComponent,
    CustomInputComponent,
    SelectComponent,
    SelectItem
} from "@shared/components";
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {LocalhostConfigComponent} from "./components/localhost-config/localhost-config.component";
import {NgrokConfigComponent} from "./components/ngrok-config/ngrok-config.component";
import {LocalhostTunnelConfig, NgrokTunnelConfig} from "../../core/models/tunnels-config.model";

@Component({
    selector: 'app-tunnels-configuration-dialog',
    templateUrl: './tunnels-configuration-dialog.component.html',
    styleUrls: ['./tunnels-configuration-dialog.component.scss'],
    imports: [
        AppIconComponent,
        CustomInputComponent,
        ReactiveFormsModule,
        SelectComponent,
        LocalhostConfigComponent,
        NgrokConfigComponent,
        ButtonComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TunnelsConfigurationDialogComponent {
    form!: FormGroup;

    private dialogRef = inject(DialogRef);
    private fb = inject(FormBuilder);
    data = inject(DIALOG_DATA);

    tunnelConfigTypes: SelectItem[] = [
        {
            name: 'Localhost',
            value: 'localhost',
        },
        {
            name: 'Ngrok',
            value: 'ngrok',
        },
    ];

    localhostConfig: LocalhostTunnelConfig = {
        full_url: '',
        protocol: '',
        timeout: 0,
        port_settings: 0,
        enable_cors: true,
        permitted_origins: [],
    };

    ngrokConfig: NgrokTunnelConfig = {
        authToken: 'string',
        region: 'string',
        public_url: 'string',
        local_port: 'string',
        web_inspection_interface: true,
        own_domain: false,
        subdomain: 'string',
        local_tcp_port: 'string',
        http_basic_auth: true,
        username: 'string',
        password: 'string',
        ip_whitelist: [],
        request_reply: true,
        logging_all_requests: true,
        webhook_verification_token: 'string',
        custom_response_headers: 'string',
        webhook_response_body: 'string',
        request_transformation_rules: 'string',
    }


    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            type: ['', Validators.required],
        })

        this.form.valueChanges.subscribe(v => console.log(v))
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    onSave(): void {
        console.log(this.form);
    }
}
