import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { GetMeResponse, UserRole } from '@shared/models';
import { map, of } from 'rxjs';

import { ProfileService } from '../../services/auth/profile.service';

function resolveUser(currentUserService: ProfileService) {
    const cached = currentUserService.currentUserSignal();
    return cached ? of(cached) : currentUserService.getCurrentUser();
}

/** Allows SuperAdmins and OrgAdmins. Redirects Members/Viewers away from workspace. */
export const workspaceGuard: CanActivateFn = () => {
    const currentUserService = inject(ProfileService);
    const router = inject(Router);

    return resolveUser(currentUserService).pipe(
        map((user: GetMeResponse) => {
            const isSuperAdmin = user.is_superadmin;
            const isOrgAdmin = user.memberships.some((m) => m.role.id === UserRole.ORG_ADMIN);
            return isSuperAdmin || isOrgAdmin ? true : router.parseUrl('/projects/my');
        })
    );
};

/** Allows only SuperAdmins. Redirects OrgAdmins to /workspace/users. */
export const superAdminGuard: CanActivateFn = () => {
    const currentUserService = inject(ProfileService);
    const router = inject(Router);

    return resolveUser(currentUserService).pipe(
        map((user: GetMeResponse) => (user.is_superadmin ? true : router.parseUrl('/workspace/users')))
    );
};
