import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CreateOrganizationRequest, GetOrganizationResponse, UpdateOrganizationRequest } from '@shared/models';
import { Observable } from 'rxjs';

import { ConfigService } from '../../../../services/config';

@Injectable({
    providedIn: 'root',
})
export class AdminOrganizationsService {
    private readonly configService = inject(ConfigService);
    private readonly http = inject(HttpClient);

    private get apiUrl(): string {
        return this.configService.apiUrl + 'admin/organizations/';
    }

    createOrganization(data: CreateOrganizationRequest): Observable<GetOrganizationResponse> {
        return this.http.post<GetOrganizationResponse>(this.apiUrl, data);
    }

    getOrganizations(): Observable<GetOrganizationResponse[]> {
        return this.http.get<GetOrganizationResponse[]>(this.apiUrl);
    }

    updateOrganization(id: number, data: UpdateOrganizationRequest): Observable<GetOrganizationResponse> {
        return this.http.patch<GetOrganizationResponse>(`${this.apiUrl}${id}/`, data);
    }

    deactivateOrganization(id: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}${id}/deactivate/`, {});
    }

    reactivateOrganization(id: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}${id}/reactivate/`, {});
    }
}
