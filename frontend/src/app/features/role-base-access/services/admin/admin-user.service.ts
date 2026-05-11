import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AdminCreateUserRequest, AdminCreateUserResponse, AdminGetUsersResponse } from '@shared/models';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../../services/config';

@Injectable({
    providedIn: 'root',
})
export class AdminUserService {
    private readonly configService = inject(ConfigService);
    private readonly http = inject(HttpClient);

    private readonly httpHeaders = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return this.configService.apiUrl + 'admin/users/';
    }

    createUser(dto: AdminCreateUserRequest): Observable<AdminCreateUserResponse> {
        return this.http.post<AdminCreateUserResponse>(this.apiUrl, dto);
    }

    getUsers(): Observable<AdminGetUsersResponse> {
        return this.http.get<AdminGetUsersResponse>(this.apiUrl);
    }

    grantSuperadmin(userId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}${userId}grant-superadmin/`, {});
    }

    revokeSuperadmin(userId: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}${userId}revoke-superadmin/`, {});
    }
}
