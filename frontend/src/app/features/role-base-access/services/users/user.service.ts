import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
    AssignUsersToOrgRequest,
    AssignUsersToOrgResponse,
    CreateUserRequest,
    GetUserResponse,
    OrgUserResponse,
} from '@shared/models';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../../services/config';

@Injectable({
    providedIn: 'root',
})
export class UserService {
    private readonly configService = inject(ConfigService);
    private readonly http = inject(HttpClient);

    private readonly httpHeaders = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return this.configService.apiUrl + 'admin/organizations/';
    }

    createUser(orgId: number, dto: CreateUserRequest): Observable<GetUserResponse> {
        return this.http.post<GetUserResponse>(`${this.apiUrl}${orgId}/users/`, dto, {
            headers: this.httpHeaders,
        });
    }

    updateUserRole(orgId: number, userId: number, roleId: number): Observable<GetUserResponse> {
        const dto = { role_id: roleId };

        return this.http.patch<GetUserResponse>(`${this.apiUrl}${orgId}/users/${userId}/`, dto, {
            headers: this.httpHeaders,
        });
    }

    assignUsersToOrg(orgId: number, dto: AssignUsersToOrgRequest): Observable<AssignUsersToOrgResponse> {
        return this.http.post<AssignUsersToOrgResponse>(`${this.apiUrl}${orgId}/assign-users/`, dto, {
            headers: this.httpHeaders,
        });
    }

    removeUserFromOrg(orgId: number, userId: number): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}${orgId}/users/${userId}/`);
    }

    getUsers(orgId: number): Observable<OrgUserResponse[]> {
        return this.http.get<OrgUserResponse[]>(`${this.apiUrl}${orgId}/users/`);
    }
}
