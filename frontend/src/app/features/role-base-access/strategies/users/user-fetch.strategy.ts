import { FullMembership } from '@shared/models';
import { Observable } from 'rxjs';

export interface NormalizedUser {
    id: number;
    email: string;
    avatarUrl: string | null;
    displayName: string | null;
    isSuperadmin: boolean;
    isActive: boolean;
    memberships: FullMembership[];
}

export interface UserFetchStrategy {
    fetchUsers(): Observable<NormalizedUser[]>;
}
