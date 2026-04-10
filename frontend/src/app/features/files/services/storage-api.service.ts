import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { EMPTY, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { ConfigService } from '../../../services/config/config.service';
import { CreateFolderDialogResult } from '../components/create-folder-dialog/create-folder-dialog.component';
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

    handleAddFilesResult(
        result: CreateFolderDialogResult,
        filterFiles: (files: File[]) => File[] = (f) => f
    ): Observable<{ type: 'mkdir'; path: string } | { type: 'upload'; count: number }> {
        const targetPath = result.targetPath;

        if (result.mkdirOnly) {
            if (!targetPath) return EMPTY;
            return this.mkdir(targetPath).pipe(map(() => ({ type: 'mkdir' as const, path: targetPath })));
        }

        const validFiles = filterFiles(result.files);
        if (!validFiles.length) return EMPTY;

        const upload$ = targetPath
            ? this.ensureFolderAndUpload(targetPath, validFiles).pipe(map((r) => r.uploadedCount))
            : this.uploadMany('', validFiles).pipe(map(() => validFiles.length));

        return upload$.pipe(map((count) => ({ type: 'upload' as const, count })));
    }

    ensureFolderAndUpload(targetFolder: string, files: File[]): Observable<{ uploadedCount: number }> {
        const normalizedTarget = this.normalizePath(targetFolder);
        if (!files.length) {
            return of({ uploadedCount: 0 });
        }
        return this.uploadMany(normalizedTarget, files).pipe(map(() => ({ uploadedCount: files.length })));
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
        return this.http.post<void>(`${this.apiUrl}move/`, {
            from_path: from,
            to_path: this.normalizeCopyTargetPath(to),
        });
    }

    copy(from: string, to: string): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}copy/`, {
            from_path: from,
            to_path: this.normalizeCopyTargetPath(to),
        });
    }

    addToGraph(path: string, graphIds: number[]): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}add-to-graph/`, {
            path,
            graph_ids: graphIds,
        });
    }

    removeFromGraph(path: string, graphIds: number[]): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}remove-from-graph/`, {
            path,
            graph_ids: graphIds,
        });
    }

    getGraphFiles(path: string): Observable<number[]> {
        return this.http
            .get<{ graph_ids: number[] }>(`${this.apiUrl}graph-files/`, {
                params: { path },
            })
            .pipe(map((res) => res.graph_ids ?? []));
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

    private normalizeCopyTargetPath(path: string): string {
        const normalized = this.normalizePath(path);
        return normalized === '' ? '/' : normalized;
    }
}
