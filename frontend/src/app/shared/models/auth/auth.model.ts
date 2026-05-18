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

export interface TokenPair {
    access: string;
    refresh: string;
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
