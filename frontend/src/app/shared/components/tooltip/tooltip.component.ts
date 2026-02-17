import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MATERIAL_FORMS } from "@shared/material-forms";

@Component({
    selector: 'app-tooltip',
    templateUrl: './tooltip.component.html',
    styleUrls: ['./tooltip.component.scss'],
    imports: [
        MATERIAL_FORMS
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TooltipComponent {
    icon = input<string>();
    label = input<string>('');
    required = input<boolean>(false);
    tooltipText = input<string>('');
}
