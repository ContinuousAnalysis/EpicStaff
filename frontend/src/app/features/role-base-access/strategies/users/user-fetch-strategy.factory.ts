import { CurrentUserService } from '../../../../services/auth/current-user.service';
import { AdminUserService } from '../../services/admin/admin-user.service';
import { UserService } from '../../services/users/user.service';
import { OrgAdminUserFetchStrategy } from './org-admin-user-fetch.strategy';
import { SuperAdminUserFetchStrategy } from './super-admin-user-fetch.strategy';
import { UserFetchStrategy } from './user-fetch.strategy';

export function createUserFetchStrategy(
    currentUserService: CurrentUserService,
    adminUserService: AdminUserService,
    userService: UserService
): UserFetchStrategy {
    const isSuperAdmin = currentUserService.isMeSuperAdmin();

    if (isSuperAdmin) {
        return new SuperAdminUserFetchStrategy(adminUserService);
    }

    return new OrgAdminUserFetchStrategy(userService, currentUserService);
}
