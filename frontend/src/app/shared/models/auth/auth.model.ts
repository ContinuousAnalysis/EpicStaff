import { FullMembership } from '../role-based-access';

export interface FirstSetupStatus {
    needs_setup: boolean;
}

export interface FirstSetupRequest {
    email: string;
    password: string;
    display_name?: string;
}

export interface FirstSetupResponse {
    access: string;
    refresh: string;
    organization: SetupOrganizationResponse;
    user: SetupUserResponse;
}

export interface SetupOrganizationResponse {
    id: number;
    is_active: boolean;
    name: string;
}

export interface SetupUserResponse {
    display_name: string;
    email: string;
    id: number;
    is_superadmin: boolean;
}

export interface GetMeResponse {
    id: number;
    email: string;
    display_name: string;
    avatar_url: string;
    is_superadmin: boolean;
    memberships: FullMembership[];
}
