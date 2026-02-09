import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
    CreateClassificationDecisionTableNodeRequest,
    GetClassificationDecisionTableNodeRequest,
} from '../models/classification-decision-table-node.model';
import { ConfigService } from '../../../../../services/config/config.service';

@Injectable({
    providedIn: 'root',
})
export class ClassificationDecisionTableNodeService {
    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    constructor(
        private http: HttpClient,
        private configService: ConfigService
    ) {}

    private get apiUrl(): string {
        return this.configService.apiUrl + 'classification-decision-table-node/';
    }

    createNode(
        request: CreateClassificationDecisionTableNodeRequest
    ): Observable<GetClassificationDecisionTableNodeRequest> {
        return this.http.post<GetClassificationDecisionTableNodeRequest>(
            this.apiUrl,
            request,
            { headers: this.headers }
        );
    }

    getNodeById(id: number): Observable<GetClassificationDecisionTableNodeRequest> {
        return this.http.get<GetClassificationDecisionTableNodeRequest>(
            `${this.apiUrl}${id}/`,
            { headers: this.headers }
        );
    }

    deleteNode(id: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}${id}/`, {
            headers: this.headers,
        });
    }
}
