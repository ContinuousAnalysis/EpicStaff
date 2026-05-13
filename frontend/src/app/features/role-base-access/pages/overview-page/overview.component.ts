import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppSvgIconComponent } from '@shared/components';

@Component({
    selector: 'app-overview',
    templateUrl: './overview.component.html',
    styleUrls: ['./overview.component.scss'],
    imports: [RouterOutlet, RouterLink, RouterLinkActive, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {}
