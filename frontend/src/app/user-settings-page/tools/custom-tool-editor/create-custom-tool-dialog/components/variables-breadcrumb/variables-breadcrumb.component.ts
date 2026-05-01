import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

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

    private readonly track = viewChild<ElementRef<HTMLElement>>('track');

    scrollToStart(): void {
        const el = this.track()?.nativeElement;
        if (el) {
            el.scrollTo({ left: 0, behavior: 'smooth' });
        }
    }
}
