import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';

import { ConfigService } from '../../services/config/config.service';

export interface RunPythonCodeRequest {
    python_code_id: number | null;
    code: string;
    entrypoint: string;
    libraries: string[];
    inputs: Record<string, string>;
}

export interface PythonCodeResult {
    status: 'pending' | 'success' | 'error';
    output?: string;
    error?: string;
}

@Injectable({ providedIn: 'root' })
export class PythonCodeRunService {
    private headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    private readonly http = inject(HttpClient);
    private readonly configService = inject(ConfigService);

    private get apiUrl(): string {
        return this.configService.apiUrl;
    }

    runPythonCode(payload: RunPythonCodeRequest): Observable<{ execution_id: string }> {
        return this.http.post<{ execution_id: string }>(`${this.apiUrl}run-python-code/`, payload, {
            headers: this.headers,
        });
    }

    getResult(executionId: string): Observable<PythonCodeResult> {
        return this.http.get<PythonCodeResult>(`${this.apiUrl}python-code-result/${executionId}/`);
    }

    pollResult(executionId: string): Observable<PythonCodeResult> {
        return timer(10000, 2000).pipe(
            switchMap(() => this.getResult(executionId)),
            takeWhile((result) => result.status === 'pending', true)
        );
    }
}
