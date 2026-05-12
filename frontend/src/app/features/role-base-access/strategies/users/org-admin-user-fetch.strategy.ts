import { FullMembership, OrgUserResponse, UserRole } from '@shared/models';
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

        const adminMemberships = currentUser.memberships.filter(({ role }) => role.id === UserRole.ORG_ADMIN);
        if (!adminMemberships.length) return of([]);

        // Build orgId → org lookup from /me data (per-org endpoint doesn't return org info)
        const orgById = new Map(adminMemberships.map(({ organization }) => [organization.id, organization]));

        const requests = adminMemberships.map(({ organization }) =>
            this.userService.getUsers(organization.id).pipe(map((users) => ({ orgId: organization.id, users })))
        );

        return forkJoin(requests).pipe(map((results) => this.mergeAndDeduplicate(results, orgById)));
    }

    private mergeAndDeduplicate(
        orgResults: { orgId: number; users: OrgUserResponse[] }[],
        orgById: Map<number, { id: number; name: string }>
    ): NormalizedUser[] {
        const userMap = new Map<number, NormalizedUser>();

        for (const { orgId, users } of orgResults) {
            const organization = orgById.get(orgId) ?? { id: orgId, name: '' };

            for (const user of users) {
                const membership: FullMembership = {
                    organization,
                    id: user.membership.id,
                    role: user.membership.role,
                    joined_at: user.membership.joined_at,
                };

                const existing = userMap.get(user.id);
                if (existing) {
                    if (!existing.memberships.some((m) => m.organization.id === orgId)) {
                        existing.memberships.push(membership);
                    }
                } else {
                    userMap.set(user.id, {
                        id: user.id,
                        email: user.email,
                        displayName: user.display_name,
                        isSuperadmin: user.is_superadmin,
                        isActive: user.is_active,
                        memberships: [membership],
                    });
                }
            }
        }

        return Array.from(userMap.values());
    }
}
