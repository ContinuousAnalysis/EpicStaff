import { FullMembership, OrgUserMembership } from './membership.model';

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

export interface AssignUsersToOrgRequest {
    assignments: Assigment[];
}

export interface AssignUsersToOrgResponse {
    created: GetUserResponse[];
    updated: GetUserResponse[];
}

export interface GetUserResponse {
    id: number;
    email: string;
    display_name: string;
    is_superadmin: boolean;
    is_active: boolean;
    membership: FullMembership;
}

export interface OrgUserResponse {
    id: number;
    email: string;
    avatar_url: string | null;
    display_name: string | null;
    is_superadmin: boolean;
    is_active: boolean;
    membership: OrgUserMembership;
}

export interface Assigment {
    user_id: number;
    role_id: number;
}
