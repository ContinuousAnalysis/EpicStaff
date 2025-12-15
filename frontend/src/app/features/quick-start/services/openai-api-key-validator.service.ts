import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class OpenAiApiKeyValidatorService {
  private http = inject(HttpClient);

  private readonly openAiApiUrl = 'https://api.openai.com/v1/models';

  /**
   * Validates OpenAI API key by making a request to OpenAI API
   * @param apiKey The API key to validate
   * @returns Observable<boolean> - true if key is valid, false otherwise
   */
  validateApiKey(apiKey: string): Observable<boolean> {
    if (!apiKey || apiKey.trim().length === 0) {
      return of(false);
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${apiKey.trim()}`,
    });

    return this.http
      .get(this.openAiApiUrl, { headers, observe: 'response' })
      .pipe(
        map((response) => {
          // If we get a successful response (200-299), the key is valid
          return response.status >= 200 && response.status < 300;
        }),
        catchError(() => {
          // If there's an error (401, 403, etc.), the key is invalid
          return of(false);
        })
      );
  }
}

