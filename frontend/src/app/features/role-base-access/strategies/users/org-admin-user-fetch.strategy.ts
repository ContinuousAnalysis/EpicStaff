import { GetUserResponse, UserRole } from '@shared/models';
import { forkJoin, map, Observable, of } from 'rxjs';

import { CurrentUserService } from '../../../../services/auth/current-user.service';
import { UserService } from '../../services/users/user.service';
import { NormalizedUser, UserFetchStrategy } from './user-fetch.strategy';

export class OrgAdminUserFetchStrategy implements UserFetchStrategy {
    constructor(
        private userService: UserService,
        private currentUserService: CurrentUserService
    ) {}

    fetchUsers(): Observable<NormalizedUser[]> {
        const currentUser = this.currentUserService.currentUserSignal();
        if (!currentUser) return of([]);

        const adminOrgIds = currentUser.memberships
            .filter(({ role }) => role.id === UserRole.ORG_ADMIN)
            .map(({ organization }) => organization.id);

        if (!adminOrgIds.length) return of([]);

        const requests = adminOrgIds.map((orgId) => this.userService.getUsers(orgId));

        return forkJoin(requests).pipe(map((results) => this.mergeAndDeduplicate(results)));
    }

    private mergeAndDeduplicate(orgResults: GetUserResponse[][]): NormalizedUser[] {
        const userMap = new Map<number, NormalizedUser>();

        for (const users of orgResults) {
            for (const user of users) {
                const existing = userMap.get(user.id);
                if (existing) {
                    const alreadyHasOrg = existing.memberships.some(
                        (m) => m.organization.id === user.membership.organization.id
                    );
                    if (!alreadyHasOrg) {
                        existing.memberships.push(user.membership);
                    }
                } else {
                    userMap.set(user.id, {
                        id: user.id,
                        email: user.email,
                        displayName: user.display_name,
                        isSuperadmin: user.is_superadmin,
                        isActive: user.is_active,
                        memberships: [user.membership],
                    });
                }
            }
        }

        return Array.from(userMap.values());
    }
}
