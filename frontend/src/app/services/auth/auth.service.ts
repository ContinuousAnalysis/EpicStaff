import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, of, switchMap } from 'rxjs';
import { ConfigService } from '../config/config.service';

interface TokenPair {
  access: string;
  refresh: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  private readonly accessKey = 'auth.access';
  private readonly refreshKey = 'auth.refresh';

  private get baseUrl(): string {
    return this.configService.apiUrl.replace(/\/+$/, '');
  }

  login(username: string, password: string): Observable<boolean> {
    return this.http
      .post<TokenPair>(`${this.baseUrl}/auth/token/`, { username, password })
      .pipe(
        tap((tokens) => this.storeTokens(tokens)),
        map(() => true)
      );
  }

  refreshToken(): Observable<string | null> {
    const refresh = this.getRefreshToken();
    if (!refresh) return of(null);

    return this.http
      .post<{ access: string }>(`${this.baseUrl}/auth/token/refresh/`, {
        refresh,
      })
      .pipe(
        tap((resp) => this.setAccessToken(resp.access)),
        map((resp) => resp.access)
      );
  }

  logout(): void {
    localStorage.removeItem(this.accessKey);
    localStorage.removeItem(this.refreshKey);
  }

  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;
    const payload = this.getTokenPayload(token);
    if (!payload?.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshKey);
  }

  private setAccessToken(token: string): void {
    localStorage.setItem(this.accessKey, token);
  }

  private storeTokens(tokens: TokenPair): void {
    localStorage.setItem(this.accessKey, tokens.access);
    localStorage.setItem(this.refreshKey, tokens.refresh);
  }

  private getTokenPayload(token: string): any | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}
