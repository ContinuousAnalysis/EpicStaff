import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { Router } from '@angular/router';
import { AppSvgIconComponent } from '@shared/components';
import { FullMembership, GetMeResponse } from '@shared/models';
import { EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../../../../services/auth/auth.service';
import { ProfileService } from '../../../../services/auth/profile.service';
import { OrgAvatarComponent } from '../org-avatar/org-avatar.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
    selector: 'app-user-menu',
    imports: [CommonModule, AppSvgIconComponent, UserAvatarComponent, OrgAvatarComponent],
    templateUrl: './user-menu.component.html',
    styleUrls: ['./user-menu.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
    private authService = inject(AuthService);
    private router = inject(Router);
    protected currentUserService = inject(ProfileService);

    public user = input.required<GetMeResponse>();
    public organizations = computed<FullMembership[]>(() => this.user().memberships);

    isUserMenuOpen = model<boolean>(false);

    public onOrgClick(id: number): void {
        void id;
        this.isUserMenuOpen.set(false);
    }

    public onWorkspaceClick(): void {
        this.isUserMenuOpen.set(false);
        this.router.navigate(['/workspace']);
    }

    public onProfileClick(): void {
        this.isUserMenuOpen.set(false);
        this.router.navigate(['/profile']);
    }

    public onSignOutClick(): void {
        this.isUserMenuOpen.set(false);
        this.authService
            .logout()
            .pipe(
                catchError(() => {
                    this.authService.removeTokensAndNavToLogin();
                    return EMPTY;
                })
            )
            .subscribe();
    }
}
