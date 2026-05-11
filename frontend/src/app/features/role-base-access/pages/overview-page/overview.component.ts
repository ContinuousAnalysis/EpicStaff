import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppSvgIconComponent } from '@shared/components';
import { UserRole } from '@shared/models';

import { CurrentUserService } from '../../../../services/auth/current-user.service';

@Component({
    selector: 'app-overview',
    templateUrl: './overview.component.html',
    styleUrls: ['./overview.component.scss'],
    imports: [RouterOutlet, RouterLink, RouterLinkActive, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent {
    private currentUserService = inject(CurrentUserService);

    // Check whether current user have
    canManageUsers = computed(() => {
        const currentUser = this.currentUserService.currentUserSignal();
        if (!currentUser) return false;

        return currentUser.memberships.some(
            ({ role }) => role.id === UserRole.SUPER_ADMIN || role.id === UserRole.ORG_ADMIN
        );
    });
}
