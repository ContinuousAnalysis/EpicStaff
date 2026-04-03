import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';

import { ToastService } from '../../../../../../services/notifications/toast.service';
import { AppIconComponent } from '../../../../../../shared/components/app-icon/app-icon.component';
import { DragDropAreaComponent } from '../../../../../../shared/components/drag-drop-area/drag-drop-area.component';
import { SpinnerComponent } from '../../../../../../shared/components/spinner/spinner.component';
import {
    CreateFolderDialogComponent,
    CreateFolderDialogData,
    CreateFolderDialogResult,
} from '../../../../components/create-folder-dialog/create-folder-dialog.component';
import { StorageItem } from '../../../../models/storage.models';
import { StorageApiService } from '../../../../services/storage-api.service';
import { StoragePreviewComponent } from './components/storage-preview/storage-preview.component';
import { StorageTreeComponent } from './components/storage-tree/storage-tree.component';

@Component({
    selector: 'app-storage-page',
    imports: [StorageTreeComponent, StoragePreviewComponent, SpinnerComponent, DragDropAreaComponent, AppIconComponent],
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
                next: (items) => this.treeData.set(Array.isArray(items) ? items : []),
                error: () => this.toastService.error('Failed to load storage files'),
            });
    }

    onFileSelect(item: StorageItem): void {
        this.selectedFile.set(item);
    }

    onFolderToggle(item: StorageItem): void {
        if (item.isExpanded && (!item.children || item.children.length === 0)) {
            this.storageApiService
                .list(item.path)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (children) => {
                        item.children = Array.isArray(children) ? children : [];
                        this.treeData.update((data) => [...data]);
                    },
                    error: () => this.toastService.error(`Failed to load folder "${item.name}"`),
                });
        }
    }

    onContextAction(event: { action: string; item: StorageItem }): void {
        switch (event.action) {
            case 'download':
                this.storageApiService.download(event.item.path);
                break;
            case 'delete':
                this.handleDelete(event.item);
                break;
            case 'rename':
                // Handled inline by tree component
                break;
            case 'copy':
                // TODO: Implement copy-to-folder dialog
                break;
            case 'view-details':
                this.selectedFile.set(event.item);
                break;
        }
    }

    openCreateFolderDialog(folderPath: string = ''): void {
        const data: CreateFolderDialogData = folderPath ? { folderPath } : {};
        const dialogRef = this.dialog.open<CreateFolderDialogResult, CreateFolderDialogData>(
            CreateFolderDialogComponent,
            { data }
        );
        dialogRef.closed.subscribe((result) => {
            if (!result) return;
            this.storageApiService
                .mkdir(result.folderName)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: () => {
                        this.toastService.success(`Folder "${result.folderName}" created`);
                        this.loadTree();
                        if (result.files.length) {
                            result.files.forEach((file) => {
                                const uploadPath = result.folderName;
                                this.storageApiService
                                    .upload(uploadPath, file)
                                    .pipe(takeUntilDestroyed(this.destroyRef))
                                    .subscribe({
                                        next: () => {
                                            this.toastService.success(`"${file.name}" uploaded`);
                                            this.loadTree();
                                        },
                                        error: () => this.toastService.error(`Failed to upload "${file.name}"`),
                                    });
                            });
                        }
                    },
                    error: () => this.toastService.error('Failed to create folder'),
                });
        });
    }

    onFilesDropped(files: FileList): void {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            this.storageApiService
                .upload('', file)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: () => {
                        this.toastService.success(`"${file.name}" uploaded`);
                        this.loadTree();
                    },
                    error: () => this.toastService.error(`Failed to upload "${file.name}"`),
                });
        }
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
}
