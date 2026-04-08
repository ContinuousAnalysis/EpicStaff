import { Dialog } from '@angular/cdk/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';

import { ToastService } from '../../../../../../services/notifications/toast.service';
import { DragDropAreaComponent } from '../../../../../../shared/components/drag-drop-area/drag-drop-area.component';
import { SpinnerComponent } from '../../../../../../shared/components/spinner/spinner.component';
import {
    CreateFolderDialogComponent,
    CreateFolderDialogData,
    CreateFolderDialogResult,
} from '../../../../components/create-folder-dialog/create-folder-dialog.component';
import { StorageDetailsDialogComponent } from '../../../../components/storage-details-dialog/storage-details-dialog.component';
import { StorageItem, StorageItemInfo } from '../../../../models/storage.models';
import { StorageApiService } from '../../../../services/storage-api.service';
import { StoragePreviewComponent } from './components/storage-preview/storage-preview.component';
import { StorageTreeComponent } from './components/storage-tree/storage-tree.component';

@Component({
    selector: 'app-storage-page',
    imports: [StorageTreeComponent, StoragePreviewComponent, SpinnerComponent, DragDropAreaComponent],
    templateUrl: './storage-page.component.html',
    styleUrls: ['./storage-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragePageComponent {
    private destroyRef = inject(DestroyRef);
    private storageApiService = inject(StorageApiService);
    private toastService = inject(ToastService);
    private dialog = inject(Dialog);

    isLoading = signal<boolean>(true);
    treeData = signal<StorageItem[]>([]);
    selectedFile = signal<StorageItem | null>(null);
    showSidebar = signal<boolean>(true);
    private readonly allowedUploadExtensions = new Set([
        'pdf',
        'csv',
        'docx',
        'txt',
        'json',
        'html',
        'zip',
        'tar',
        'gz',
        'bz2',
        'xz',
    ]);

    readonly onOpenCreateFolder = (folderPath: string): void => {
        this.openCreateFolderDialog(folderPath);
    };

    toggleSidebar(): void {
        this.showSidebar.update((v) => !v);
    }

    constructor() {
        effect(() => {
            this.storageApiService.refreshTick();
            this.loadTree();
        });
    }

    loadTree(): void {
        this.isLoading.set(true);
        this.storageApiService
            .list('')
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isLoading.set(false))
            )
            .subscribe({
                next: (items) => this.treeData.set(this.withPaths(Array.isArray(items) ? items : [], '')),
                error: () => this.toastService.error('Failed to load storage files'),
            });
    }

    private withPaths(items: StorageItem[], parentPath: string): StorageItem[] {
        return items.map((item) => ({
            ...item,
            path: parentPath ? `${parentPath}/${item.name}` : item.name,
        }));
    }

    onFileSelect(item: StorageItem): void {
        this.setSelectedItem(item);
    }

    onFolderSelect(item: StorageItem): void {
        this.setSelectedItem(item);
    }

    onFolderToggle(item: StorageItem): void {
        this.selectedFile.set(null);
        if (item.isExpanded && (!item.children || item.children.length === 0)) {
            this.storageApiService
                .list(item.path)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (children) => {
                        item.children = this.withPaths(Array.isArray(children) ? children : [], item.path);
                        this.treeData.update((data) => [...data]);
                    },
                    error: () => this.toastService.error(`Failed to load folder "${item.name}"`),
                });
        }
    }

    onContextAction(event: {
        action: string;
        item: StorageItem;
        selectedItems?: StorageItem[];
        renameFromPath?: string;
    }): void {
        switch (event.action) {
            case 'download':
                this.storageApiService.download(event.item.path);
                break;
            case 'delete':
                this.handleDelete(event.item);
                break;
            case 'rename':
                this.handleRename(event);
                break;
            case 'copy':
                // TODO: Implement copy-to-folder dialog
                break;
            case 'duplicate-here':
                // TODO: Implement duplicate in current folder
                this.toastService.info('Duplicate here is coming soon');
                break;
            case 'download-selected':
                this.handleDownloadSelected(event.selectedItems ?? []);
                break;
            case 'delete-selected':
                this.handleDeleteSelected(event.selectedItems ?? []);
                break;
            case 'download-all':
                this.handleDownloadAll();
                break;
            case 'delete-all':
                this.handleDeleteAll();
                break;
            case 'view-details':
                this.handleViewDetails(event.item);
                break;
        }
    }

    openCreateFolderDialog(folderPath: string = ''): void {
        const data: CreateFolderDialogData = folderPath ? { folderPath } : {};
        const dialogRef = this.dialog.open<CreateFolderDialogResult, CreateFolderDialogData>(
            CreateFolderDialogComponent,
            { data }
        );
        dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
            if (!result) return;
            const targetFolder = result.folderName.trim();
            if (!targetFolder) return;
            const validFiles = this.filterAllowedFiles(result.files);
            this.storageApiService
                .ensureFolderAndUpload(targetFolder, validFiles)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (flow) => {
                        if (flow.alreadyExists) {
                            this.toastService.info(`Folder "${targetFolder}" already exists`);
                        } else if (flow.created) {
                            this.toastService.success(`Folder "${targetFolder}" created`);
                        }
                        if (flow.uploadedCount > 0) {
                            this.toastService.success(`${flow.uploadedCount} file(s) uploaded`);
                        }
                        this.loadTree();
                    },
                    error: () => this.toastService.error('Failed to create folder'),
                });
        });
    }

    onFilesDropped(files: FileList): void {
        const dropped = Array.from(files);
        const validFiles = this.filterAllowedFiles(dropped);
        if (!validFiles.length) {
            return;
        }
        this.storageApiService
            .uploadMany('', validFiles)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toastService.success(`${validFiles.length} file(s) uploaded`);
                    this.loadTree();
                },
                error: () => this.toastService.error('Failed to upload files'),
            });
    }

    private handleRename(event: { item: StorageItem; renameFromPath?: string }): void {
        const from = event.renameFromPath?.trim() ?? '';
        const to = event.item.path?.trim() ?? '';
        if (!from || !to || from === to) {
            return;
        }
        this.storageApiService
            .rename(from, to)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toastService.success(`Renamed to "${event.item.name}"`);
                    if (this.selectedFile()?.path === from) {
                        this.selectedFile.set(event.item);
                    }
                    this.loadTree();
                },
                error: () => this.toastService.error('Failed to rename'),
            });
    }

    private handleDelete(item: StorageItem): void {
        this.storageApiService
            .delete(item.path)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => {
                    this.toastService.success(`"${item.name}" deleted`);
                    if (this.selectedFile()?.path === item.path) {
                        this.selectedFile.set(null);
                    }
                    this.loadTree();
                },
                error: () => this.toastService.error(`Failed to delete "${item.name}"`),
            });
    }

    private handleViewDetails(item: StorageItem): void {
        this.selectedFile.set(item);
        if (!item.path) {
            return;
        }
        this.storageApiService
            .info(item.path)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (details) => {
                    this.openDetailsDialog(details, item.path, item.type);
                    this.selectedFile.set({
                        ...item,
                        ...details,
                        path: item.path,
                    });
                },
                error: () => this.toastService.error(`Failed to load details for "${item.name}"`),
            });
    }

    private openDetailsDialog(details: StorageItemInfo, fallbackPath: string, fallbackType: 'file' | 'folder'): void {
        this.dialog.open(StorageDetailsDialogComponent, {
            data: {
                ...details,
                type: details.type ?? fallbackType,
                path: details.path || fallbackPath,
                usedIn: [],
            },
        });
    }

    private handleDownloadSelected(selectedItems: StorageItem[]): void {
        const paths = selectedItems.map((item) => item.path).filter((path): path is string => Boolean(path));
        if (!paths.length) {
            this.toastService.info('Select a file or folder first');
            return;
        }
        this.storageApiService
            .downloadZip(paths)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob) => this.downloadBlobFile(blob, 'selected-items.zip'),
                error: () => this.toastService.error('Failed to download selected items'),
            });
    }

    private handleDeleteSelected(selectedItems: StorageItem[]): void {
        this.deleteItems(selectedItems, 'Selected items deleted', 'Select a file or folder first');
    }

    private handleDownloadAll(): void {
        const paths = this.treeData()
            .map((item) => item.path)
            .filter((path): path is string => Boolean(path));
        if (!paths.length) {
            this.toastService.info('Nothing to download');
            return;
        }
        this.storageApiService
            .downloadZip(paths)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob) => this.downloadBlobFile(blob, 'storage-all.zip'),
                error: () => this.toastService.error('Failed to download all items'),
            });
    }

    private handleDeleteAll(): void {
        const items = this.treeData();
        this.deleteItems(items, 'All items deleted', 'Nothing to delete', true);
    }

    private downloadBlobFile(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    private filterAllowedFiles(files: File[]): File[] {
        const valid: File[] = [];
        for (const file of files) {
            const lowerName = file.name.toLowerCase();
            const ext = lowerName.includes('.') ? (lowerName.split('.').pop() ?? '') : '';
            const isTarCompressed =
                lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tar.bz2') || lowerName.endsWith('.tar.xz');
            const allowed = this.allowedUploadExtensions.has(ext) || isTarCompressed;
            if (allowed) {
                valid.push(file);
            } else {
                this.toastService.error(`"${file.name}" is not an allowed file type`);
            }
        }
        return valid;
    }

    private setSelectedItem(item: StorageItem): void {
        this.selectedFile.set(item);
    }

    private deleteItems(
        candidates: StorageItem[],
        successMessage: string,
        emptyMessage: string,
        clearSelectedFile: boolean = false
    ): void {
        const items = candidates.filter((item): item is StorageItem & { path: string } => Boolean(item.path));
        if (!items.length) {
            this.toastService.info(emptyMessage);
            return;
        }

        const requests = items.map((item) =>
            this.storageApiService.delete(item.path).pipe(
                map(() => ({ item, ok: true as const })),
                catchError((error: HttpErrorResponse) => of({ item, ok: false as const, error }))
            )
        );

        forkJoin(requests)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((results) => {
                const failed = results.filter((result) => !result.ok && result.error?.status !== 404);
                if (failed.length === 0) {
                    this.toastService.success(successMessage);
                } else {
                    this.toastService.error(`Failed to delete ${failed.length} item(s)`);
                }

                if (clearSelectedFile) {
                    this.selectedFile.set(null);
                } else if (this.selectedFile()?.path && items.some((item) => item.path === this.selectedFile()?.path)) {
                    this.selectedFile.set(null);
                }
                this.loadTree();
            });
    }
}
