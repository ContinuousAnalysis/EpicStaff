import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from '../../../services/config/config.service';

export interface QuickstartStatusResponse {
  quickstart_completed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class QuickstartStatusService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);

  private readonly httpHeaders = new HttpHeaders({
    'Content-Type': 'application/json',
  });

  private get apiUrl(): string {
    return `${this.configService.apiUrl}quickstart-status/`;
  }

  /**
   * Gets quickstart tour completion status
   * @returns Observable with object containing quickstart_completed field (true/false)
   */
  getStatus(): Observable<QuickstartStatusResponse> {
    return this.http.get<QuickstartStatusResponse>(this.apiUrl);
  }

  /**
   * Updates quickstart tour completion status
   * @param completed - true if tour is completed, false if not
   * @returns Observable with updated status
   */
  updateStatus(completed: boolean): Observable<QuickstartStatusResponse> {
    return this.http.put<QuickstartStatusResponse>(
      this.apiUrl,
      { quickstart_completed: completed },
      { headers: this.httpHeaders }
    );
  }
}

