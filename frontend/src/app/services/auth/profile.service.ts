import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
    GetMeResponse,
    PasswordChangeConfirmRequest,
    PasswordChangeVerifyRequest,
    PasswordChangeVerifyResponse,
    TokenPair,
    UpdateMeRequest,
    UserRole,
} from '@shared/models';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { ROLE_LABELS } from '../../features/role-base-access/constants/role-labels.constant';
import { ConfigService } from '../config';

@Injectable({
    providedIn: 'root',
})
export class ProfileService {
    private readonly http = inject(HttpClient);
    private readonly configService = inject(ConfigService);

    private get baseUrl(): string {
        return `${this.configService.apiUrl}profile/`;
    }

    private readonly currentUser = signal<GetMeResponse | null>(null);
    currentUserSignal = this.currentUser.asReadonly();

    isMeSuperAdmin = computed(() => this.currentUser()?.is_superadmin ?? false);

    systemRole = computed(() => {
        const user = this.currentUser();
        if (!user) return '—';
        if (user.is_superadmin) return ROLE_LABELS[UserRole.SUPER_ADMIN];
        const firstRole = user.memberships[0]?.role.id;
        return firstRole != null ? (ROLE_LABELS[firstRole as UserRole] ?? '—') : '—';
    });

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

    getCurrentUser(): Observable<GetMeResponse> {
        return this.http.get<GetMeResponse>(this.baseUrl).pipe(tap((user) => this.setUser(user)));
    }

    updateCurrentUser(dto: UpdateMeRequest): Observable<GetMeResponse> {
        return this.http.patch<GetMeResponse>(this.baseUrl, dto).pipe(tap((user) => this.setUser(user)));
    }

    updateAvatar(avatar: FormData): Observable<GetMeResponse> {
        return this.http
            .post<GetMeResponse>(`${this.baseUrl}avatar/`, avatar)
            .pipe(tap((res) => this.updateUser({ avatar_url: res.avatar_url })));
    }

    deleteAvatar(): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}avatar/`).pipe(tap(() => this.updateUser({ avatar_url: null })));
    }

    requestPasswordChange(dto: PasswordChangeVerifyRequest): Observable<PasswordChangeVerifyResponse> {
        return this.http.post<PasswordChangeVerifyResponse>(`${this.baseUrl}password-change/request/`, dto);
    }

    confirmPasswordChange(dto: PasswordChangeConfirmRequest): Observable<TokenPair> {
        return this.http.post<TokenPair>(`${this.baseUrl}password-change/confirm/`, dto);
    }

    clearCurrentUser(): void {
        this.currentUser.set(null);
    }

    private setUser(user: GetMeResponse): void {
        this.currentUser.set(user);
    }

    private updateUser(partial: Partial<GetMeResponse>): void {
        const current = this.currentUser();
        if (!current) return;
        this.currentUser.set({ ...current, ...partial });
    }
}
