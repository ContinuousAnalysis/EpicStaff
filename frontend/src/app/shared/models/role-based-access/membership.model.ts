export interface Membership {
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
