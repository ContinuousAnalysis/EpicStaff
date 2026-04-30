import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppSvgIconComponent } from '../../../../../../shared/components/app-svg-icon/app-svg-icon.component';

export interface BreadcrumbItem {
    label: string;
    icon?: string;
}

@Component({
    selector: 'app-variables-breadcrumb',
    imports: [AppSvgIconComponent],
    templateUrl: './variables-breadcrumb.component.html',
    styleUrls: ['./variables-breadcrumb.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariablesBreadcrumbComponent {
    crumbs = input<BreadcrumbItem[]>([]);
    crumbClick = output<number>();
}
