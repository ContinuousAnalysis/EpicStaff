import {Component, inject, input, OnDestroy, OnInit} from "@angular/core";
import {FormBuilder, FormGroup} from "@angular/forms";
import {TunnelConfig} from "../../../core/models/tunnels-config.model";

@Component({
    template: ''
})
export abstract class TunnelsConfiguration<T extends TunnelConfig> implements OnInit, OnDestroy {
    protected fb = inject(FormBuilder);
    protected configForm!: FormGroup;

    parentForm = input.required<FormGroup>();
    config = input.required<T>();

    ngOnInit() {
        this.configForm = this.initializeForm(this.config());
        this.parentForm().addControl('config', this.configForm);
    }

    ngOnDestroy() {
        this.parentForm().removeControl('config');
    }

    protected abstract initializeForm(config: T): FormGroup;
}
