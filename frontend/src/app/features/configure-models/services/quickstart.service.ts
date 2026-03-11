import { HttpClient, HttpHeaders } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ConfigService } from "../../../services/config";
import { Quickstart } from "../models/quickstart.model";

@Injectable({
    providedIn: 'root'
})
export class QuickstartService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);

    private headers = new HttpHeaders({
        'Content-Type': 'application/json',
    });

    private get apiUrl(): string {
        return this.configService.apiUrl + 'quickstart/';
    }

    createQuickstart(data: Quickstart): Observable<void> {
        return this.http.post<void>(this.apiUrl, data, {
            headers: this.headers
        });
    }

    getQuickstart(): Observable<Quickstart> {
        return this.http.get<Quickstart>(this.apiUrl, {
            headers: this.headers
        });
    }
}
