import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ConfigService } from '../../../services/config/config.service';
import {
    StorageItem,
    StorageItemInfo,
    StorageSessionOutputItem,
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

    ensureFolderAndUpload(
        targetFolder: string,
        files: File[]
    ): Observable<{ alreadyExists: boolean; created: boolean; uploadedCount: number }> {
        const normalizedTarget = this.normalizePath(targetFolder);
        const { parentPath, folderName } = this.splitParentAndName(normalizedTarget);

        return this.list(parentPath).pipe(
            switchMap((items) => {
                const exists = (items ?? []).some(
                    (item) => item.type === 'folder' && item.name?.trim().toLowerCase() === folderName.toLowerCase()
                );
                if (exists) {
                    if (!files.length) {
                        return of({ alreadyExists: true, created: false, uploadedCount: 0 });
                    }
                    return this.uploadMany(normalizedTarget, files).pipe(
                        map(() => ({ alreadyExists: true, created: false, uploadedCount: files.length }))
                    );
                }

                return this.mkdir(normalizedTarget).pipe(
                    switchMap(() => {
                        if (!files.length) {
                            return of({ alreadyExists: false, created: true, uploadedCount: 0 });
                        }
                        return this.uploadMany(normalizedTarget, files).pipe(
                            map(() => ({ alreadyExists: false, created: true, uploadedCount: files.length }))
                        );
                    })
                );
            })
        );
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
        return this.uploadMany(path, [file]);
    }

    uploadMany(path: string, files: File[]): Observable<StorageUploadResponse> {
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        formData.append('path', path);

        return this.http.post<StorageUploadResponse>(`${this.apiUrl}upload/`, formData);
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
            params: { path },
        });
    }

    rename(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}rename/`, { from_path: from, to_path: to });
    }

    move(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}move/`, { from_path: from, to_path: to });
    }

    copy(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}copy/`, {
            from_path: from,
            to_path: this.normalizeCopyTargetPath(to),
        });
    }

    addToFlow(path: string, flowId: number, variableName: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}add-to-flow/`, {
            path,
            flow_id: flowId,
            variable_name: variableName,
        });
    }

    getSessionOutputs(sessionId: string): Observable<StorageSessionOutputItem[]> {
        return this.http
            .get<{ items: StorageSessionOutputItem[] }>(`${this.apiUrl}session-outputs/`, {
                params: { session_id: sessionId },
            })
            .pipe(map((res) => res.items ?? []));
    }

    private normalizePath(path: string): string {
        return path
            .trim()
            .replace(/\\/g, '/')
            .replace(/\/{2,}/g, '/')
            .replace(/^\/+|\/+$/g, '');
    }

    private splitParentAndName(path: string): { parentPath: string; folderName: string } {
        const slashIndex = path.lastIndexOf('/');
        if (slashIndex === -1) {
            return { parentPath: '', folderName: path };
        }

        return {
            parentPath: path.slice(0, slashIndex),
            folderName: path.slice(slashIndex + 1),
        };
    }

    private normalizeCopyTargetPath(path: string): string {
        const normalized = this.normalizePath(path);
        return normalized === '' ? '/' : normalized;
    }
}
