import {FormBuilder, FormGroup} from "@angular/forms";
import {Component, inject, input, OnDestroy, OnInit} from "@angular/core";
import {StrategyModel} from "../../../../models/strategy.model";

@Component({
    template: ''
})
export abstract class StrategyForm<T extends StrategyModel> implements OnInit, OnDestroy {
    protected fb = inject(FormBuilder);
    protected strategyForm!: FormGroup;

    parentForm = input.required<FormGroup>();
    params = input.required<T>();

    ngOnInit() {
        this.strategyForm = this.initializeForm(this.params());
        this.parentForm().addControl('strategyParams', this.strategyForm);
    }

    ngOnDestroy() {
        this.parentForm().removeControl('strategyParams');
    }


    protected abstract initializeForm(config: T): FormGroup;
}
