import { SelectItem } from '@shared/components';
import { UserRole } from '@shared/models';

export const USER_ROLES: SelectItem[] = [
    {
        name: 'Super Admin',
        value: UserRole.SUPER_ADMIN,
    },
    {
        name: 'Organization Admin',
        value: UserRole.ORG_ADMIN,
    },
    {
        name: 'Member',
        value: UserRole.MEMBER,
    },
    {
        name: 'Viewer',
        value: UserRole.VIEWER,
    },
];
