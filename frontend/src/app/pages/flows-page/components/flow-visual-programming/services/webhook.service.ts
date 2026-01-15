import {Injectable} from "@angular/core";
import {Observable, throwError} from "rxjs";
import {HttpClient} from "@angular/common/http";
import {shareReplay, catchError} from "rxjs/operators";
import {GetTunnelResponse, RegisterTelegramTriggerRequest} from "../models/webhook.model";
import {ConfigService} from "../../../../../services/config/config.service";

@Injectable({
    providedIn: 'root',
})
export class WebhookService {
    private tunnel$?: Observable<GetTunnelResponse>;

    constructor(private http: HttpClient, private configService: ConfigService) { }

    private get apiUrlRegisterTelegramTrigger(): string {
        return this.configService.apiUrl + 'register-telegram-trigger/';
    }

    getTunnel(): Observable<GetTunnelResponse> {
        if (!this.tunnel$) {
            this.tunnel$ = this.getTunnelFromApi().pipe(
                catchError(err => {
                    this.tunnel$ = undefined;
                    return throwError(() => err);
                }),
                shareReplay(1)
            );
        }

        return this.tunnel$;
    }

    registerTelegramTrigger(body: RegisterTelegramTriggerRequest): Observable<any> {
        return this.http.post<any>(this.apiUrlRegisterTelegramTrigger, body);
    }

    private getTunnelFromApi(): Observable<GetTunnelResponse> {
        return this.http.get<GetTunnelResponse>('http://localhost:8009/api/tunnel-url');
    }
}
