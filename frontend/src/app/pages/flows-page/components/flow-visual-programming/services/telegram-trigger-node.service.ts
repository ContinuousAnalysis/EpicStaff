import {HttpClient, HttpHeaders} from "@angular/common/http";
import {ConfigService} from "../../../../../services/config/config.service";
import {ApiGetRequest} from "../../../../../shared/models/api-request.model";
import {Observable} from "rxjs";
import {CreateTelegramTriggerNodeRequest, GetTelegramTriggerFieldsResponse} from "../models/telegram-trigger.model";
import {Injectable} from "@angular/core";

@Injectable({
    providedIn: 'root',
})
export class TelegramTriggerNodeService {
    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    constructor(private http: HttpClient, private configService: ConfigService) { }

    private get apiUrlTriggerFields(): string {
        return this.configService.apiUrl + 'telegram-trigger-available-fields/';
    }

    private get apiUrlNodeFields(): string {
        return this.configService.apiUrl + 'telegram-trigger-node-fields/';
    }

    private get apiUrlNode(): string {
        return this.configService.apiUrl + 'telegram-trigger-nodes/';
    }

    getTelegramTriggerAvailableFields(): Observable<GetTelegramTriggerFieldsResponse> {
        return this.http.get<GetTelegramTriggerFieldsResponse>(this.apiUrlTriggerFields);
    }

    createTelegramTriggerNode(request: CreateTelegramTriggerNodeRequest): Observable<any> {
        return this.http.post<any>(this.apiUrlNode, request, {
            headers: this.headers,
        });
    }

    deleteTelegramTriggerNode(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrlNode}${id}/`, {
            headers: this.headers,
        });
    }
}
