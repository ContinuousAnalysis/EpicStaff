import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AppSvgIconComponent } from '@shared/components';

@Component({
    selector: 'app-status-badge',
    imports: [AppSvgIconComponent],
    templateUrl: './status-badge.component.html',
    styleUrls: ['./status-badge.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
    modifier = input.required<string>();
    label = input.required<string>();
    /** When provided, renders an icon instead of the default dot */
    icon = input<string | null>(null);
}
