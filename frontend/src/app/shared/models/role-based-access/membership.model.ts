export interface FullMembership {
    id: number;
    organization: Organization;
    role: Role;
    joined_at: string;
}

export interface Organization {
    id: number;
    name: string;
}

export interface Role {
    id: number;
    name: string;
}

export interface OrgUserMembership {
    id: number;
    role: Role;
    joined_at: string;
}
