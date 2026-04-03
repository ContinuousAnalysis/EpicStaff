import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ConfigService } from '../../../services/config/config.service';
import {
    StorageArchiveResponse,
    StorageItem,
    StorageItemInfo,
    StorageSessionOutput,
    StorageUploadResponse,
} from '../models/storage.models';

@Injectable({
    providedIn: 'root',
})
export class StorageApiService {
    private http = inject(HttpClient);
    private configService = inject(ConfigService);

    readonly refreshTick = signal(0);

    triggerRefresh(): void {
        this.refreshTick.update((n) => n + 1);
    }

    private get apiUrl(): string {
        return `${this.configService.apiUrl}storage/`;
    }

    list(path: string): Observable<StorageItem[]> {
        return this.http
            .get<{ path: string; items: StorageItem[] }>(`${this.apiUrl}list/`, {
                params: { path },
            })
            .pipe(map((res) => res.items ?? []));
    }

    info(path: string): Observable<StorageItemInfo> {
        return this.http.get<StorageItemInfo>(`${this.apiUrl}info/`, {
            params: { path },
        });
    }

    download(path: string): void {
        const url = `${this.apiUrl}download/?path=${encodeURIComponent(path)}`;
        window.open(url, '_blank');
    }

    downloadBlob(path: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}download/`, {
            params: { path },
            responseType: 'blob',
        });
    }

    upload(path: string, file: File): Observable<StorageUploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        return this.http.post<StorageUploadResponse>(`${this.apiUrl}upload/`, formData);
    }

    uploadArchive(path: string, file: File): Observable<StorageArchiveResponse> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);

        return this.http.post<StorageArchiveResponse>(`${this.apiUrl}upload-archive/`, formData);
    }

    downloadZip(paths: string[]): Observable<Blob> {
        return this.http.post(
            `${this.apiUrl}download-zip/`,
            { paths },
            {
                responseType: 'blob',
            }
        );
    }

    mkdir(path: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}mkdir/`, { path });
    }

    delete(path: string): Observable<void> {
        return this.http.delete<void>(`${this.apiUrl}delete/`, {
            body: { path },
        });
    }

    rename(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}rename/`, { from, to });
    }

    move(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}move/`, { from, to });
    }

    copy(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}copy/`, { from, to });
    }

    addToFlow(path: string, flowId: number, variableName: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}add-to-flow/`, {
            path,
            flow_id: flowId,
            variable_name: variableName,
        });
    }

    getSessionOutputs(sessionId: string): Observable<StorageSessionOutput[]> {
        return this.http.get<StorageSessionOutput[]>(`${this.apiUrl}session-outputs/`, {
            params: { session_id: sessionId },
        });
    }
}
