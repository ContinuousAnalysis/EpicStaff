import { FullMembership } from '@shared/models';

export interface GetMeResponse {
    id: number;
    email: string;
    display_name: string | null;
    is_superadmin: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    memberships: FullMembership[];
    avatar_url: string | null;
}

export interface UpdateMeRequest {
    display_name: string;
}

export interface PasswordChangeVerifyRequest {
    current_password: string;
}

export interface PasswordChangeVerifyResponse {
    ticket: string;
    expires_in: number;
}

export interface PasswordChangeConfirmRequest {
    ticket: string;
    new_password: string;
}
