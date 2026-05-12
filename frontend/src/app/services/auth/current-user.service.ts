import { computed, Injectable, signal } from '@angular/core';
import { GetMeResponse, UserRole } from '@shared/models';

@Injectable({
    providedIn: 'root',
})
export class CurrentUserService {
    private readonly currentUser = signal<GetMeResponse | null>(null);

    public currentUserSignal = this.currentUser.asReadonly();
    public isMeSuperAdmin = computed(() => this.currentUser()?.is_superadmin ?? false);

    public setUser(user: GetMeResponse): void {
        this.currentUser.set(user);
    }

    public clearCurrentUser(): void {
        this.currentUser.set(null);
    }

    // TODO will be replaced with directive with migration to permission-verify logic
    canManageOrgs = computed(() => {
        const currentUser = this.currentUserSignal();
        if (!currentUser) return false;

        return currentUser.is_superadmin;
    });

    canManageUsers = computed(() => {
        const currentUser = this.currentUserSignal();
        if (!currentUser) return false;

        return currentUser.is_superadmin || currentUser.memberships.some(({ role }) => role.id === UserRole.ORG_ADMIN);
    });
}
