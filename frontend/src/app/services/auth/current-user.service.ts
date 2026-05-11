import { computed, Injectable, signal } from '@angular/core';
import { GetMeResponse } from '@shared/models';

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
}
