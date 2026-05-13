import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppSvgIconComponent } from '@shared/components';

import { CurrentUserService } from '../../../../services/auth/current-user.service';

@Component({
    selector: 'app-overview',
    templateUrl: './overview.component.html',
    styleUrls: ['./overview.component.scss'],
    imports: [RouterOutlet, RouterLink, RouterLinkActive, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
    protected currentUserService = inject(CurrentUserService);
}
