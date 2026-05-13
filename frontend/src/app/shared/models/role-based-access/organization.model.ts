export interface CreateOrganizationRequest {
    name: string;
}

export interface GetOrganizationResponse {
    id: number;
    name: string;
    is_active: boolean;
    member_count: number;
    created_at: string;
    updated_at: string;
}

export interface UpdateOrganizationRequest {
    name?: string;
}
