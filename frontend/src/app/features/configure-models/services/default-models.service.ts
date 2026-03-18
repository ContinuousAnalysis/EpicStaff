import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ConfigService } from "../../../services/config";
import { GetDefaultModelsResponse, UpdateDefaultModelsRequest } from "../models/default-models.model";

@Injectable({
    providedIn: 'root'
})
export class DefaultModelsService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);

    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return this.configService.apiUrl + 'default-models/';
    }

    getDefaultModels(): Observable<GetDefaultModelsResponse> {
        return this.http.get<GetDefaultModelsResponse>(this.apiUrl);
    }

    updateDefaultModels(data: UpdateDefaultModelsRequest): Observable<GetDefaultModelsResponse> {
        return this.http.put<GetDefaultModelsResponse>(this.apiUrl, data);
    }
}
