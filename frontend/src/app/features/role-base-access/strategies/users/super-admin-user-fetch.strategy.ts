import { map, Observable } from 'rxjs';

import { AdminUserService } from '../../services/admin/admin-user.service';
import { NormalizedUser, UserFetchStrategy } from './user-fetch.strategy';

export class SuperAdminUserFetchStrategy implements UserFetchStrategy {
    constructor(private adminUserService: AdminUserService) {}

    fetchUsers(): Observable<NormalizedUser[]> {
        return this.adminUserService.getUsers().pipe(
            map((response) =>
                response.results.map((user) => ({
                    id: user.id,
                    email: user.email,
                    avatarUrl: user.avatar_url,
                    displayName: user.display_name,
                    isSuperadmin: user.is_superadmin,
                    isActive: user.is_active,
                    memberships: user.memberships,
                }))
            )
        );
    }
}
