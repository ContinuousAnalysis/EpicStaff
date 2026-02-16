import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import {
    ButtonComponent,
    CustomInputComponent,
    SelectComponent,
    SelectItem
} from "@shared/components";
import { MATERIAL_FORMS } from "@shared/material-forms";
import { NgrokConfigService } from "../../services/ngrok-config.service";

@Component({
    selector: 'app-ngrok-config-tab',
    templateUrl: './ngrok-config-tab.component.html',
    styleUrls: ['./ngrok-config-tab.component.scss'],
    imports: [
        CustomInputComponent,
        ReactiveFormsModule,
        SelectComponent,
        ButtonComponent,
        MATERIAL_FORMS,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgrokConfigTabComponent implements OnInit {
    private fb = inject(FormBuilder);
    private ngrokConfigService = inject(NgrokConfigService);
    private destroyRef = inject(DestroyRef);

    form!: FormGroup;
    regionSelectItems: SelectItem[] = [
        {
            name: 'EU',
            value: 'eu',
        },
        {
            name: 'US',
            value: 'us',
        },
        {
            name: 'AP',
            value: 'ap',
        },
    ];

    ngOnInit() {
        this.initForm();
        this.getConfigs();
    }

    private initForm() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            auth_token: ['', Validators.required],
            region: ['eu', Validators.required],
            domain: ['', Validators.required],
        })
    }

    private getConfigs() {
        this.ngrokConfigService.getNgrokConfigs()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe()
    }

    createNgrokConfig() {
        this.ngrokConfigService.createNgrokConfig(this.form.value)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe()
    }
}
