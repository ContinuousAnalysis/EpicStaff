import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CreateWebScraperNodeRequest,
    GetWebScraperNodeRequest,
} from '../models/web-scraper.model';
import { ConfigService } from '../../../../../services/config/config.service';

@Injectable({
    providedIn: 'root',
})
export class WebScraperNodeService {
    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'web-scraper-knowledge-nodes/';
    }

    createWebScraperNode(
        request: CreateWebScraperNodeRequest
    ): Observable<GetWebScraperNodeRequest> {
        return this.http.post<GetWebScraperNodeRequest>(this.apiUrl, request, {
            headers: this.headers,
        });
    }

    deleteWebScraperNode(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}${id}/`, {
            headers: this.headers,
        });
    }
}

