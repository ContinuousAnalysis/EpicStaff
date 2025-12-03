import {ChangeDetectionStrategy, Component, input, model, output} from "@angular/core";

@Component({
    selector: "app-checkbox",
    templateUrl: "./checkbox.component.html",
    styleUrls: ["./checkbox.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CheckboxComponent {
    indeterminate = input<boolean>(false);
    checked = model<boolean>(false);
    mod = input<'default' | 'multiselect'>('default')
    changed = output();
}
