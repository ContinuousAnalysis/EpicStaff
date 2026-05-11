import { Membership } from '@shared/models';
import { Observable } from 'rxjs';

export interface NormalizedUser {
    id: number;
    email: string;
    displayName: string;
    isSuperadmin: boolean;
    isActive: boolean;
    memberships: Membership[];
}

export interface UserFetchStrategy {
    fetchUsers(): Observable<NormalizedUser[]>;
}
