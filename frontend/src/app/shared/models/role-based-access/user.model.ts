import { Membership } from './membership.model';

export enum UserRole {
    SUPER_ADMIN = 1,
    ORG_ADMIN = 2,
    MEMBER = 3,
    VIEWER = 4,
}

export interface CreateUserRequest {
    email: string;
    password: string;
    role_id: number;
}

export interface GetUserResponse {
    id: number;
    email: string;
    display_name: string;
    is_superadmin: boolean;
    is_active: boolean;
    membership: Membership;
}
