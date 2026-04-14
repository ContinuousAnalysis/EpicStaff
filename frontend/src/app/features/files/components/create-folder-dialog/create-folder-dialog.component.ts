import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { AppSvgIconComponent } from '../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { StorageApiService } from '../../services/storage-api.service';

export interface CreateFolderDialogData {
    /** Pre-fill the destination folder path */
    folderPath?: string;
}

export interface CreateFolderDialogResult {
    /** Full destination path: destinationPath + optional subfolder name */
    targetPath: string;
    files: File[];
    /** True when no files selected — only mkdir should be called */
    mkdirOnly: boolean;
}

export interface FolderNode {
    name: string;
    path: string;
    level: number;
    isExpanded: boolean;
    isLoading: boolean;
    hasChildren: boolean;
    children: FolderNode[];
    isLoaded: boolean;
}

@Component({
    selector: 'app-create-folder-dialog',
    imports: [FormsModule, AppSvgIconComponent],
    templateUrl: './create-folder-dialog.component.html',
    styleUrls: ['./create-folder-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateFolderDialogComponent {
    private dialogRef = inject(DialogRef<CreateFolderDialogResult>);
    private data: CreateFolderDialogData = inject(DIALOG_DATA, { optional: true }) ?? {};
    private storageApiService = inject(StorageApiService);
    private destroyRef = inject(DestroyRef);

    readonly folderName = signal('');
    readonly isDragging = signal(false);
    readonly files = signal<File[]>([]);

    // Destination folder dropdown
    readonly dropdownOpen = signal(false);
    readonly searchQuery = signal('');
    readonly rootNodes = signal<FolderNode[]>([]);
    readonly isLoadingRoot = signal(true);
    readonly selectedPath = signal<string>('');

    private readonly allNodes = signal<FolderNode[]>([]);

    readonly visibleNodes = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const roots = this.rootNodes();
        if (query) {
            return this.allNodes().filter((n) => n.name.toLowerCase().includes(query));
        }
        return this.buildVisible(roots);
    });

    get selectedFolderLabel(): string {
        const path = this.selectedPath();
        return path ? `/${path}` : '/';
    }

    readonly isValid = computed(() => this.files().length > 0 || this.folderName().trim().length > 0);

    ngOnInit(): void {
        if (this.data.folderPath) {
            this.selectedPath.set(this.data.folderPath);
        }
        this.loadLevel('', null);
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.dropdownOpen.set(false);
    }

    toggleDropdown(event: MouseEvent): void {
        event.stopPropagation();
        this.dropdownOpen.update((v) => !v);
    }

    stopPropagation(event: MouseEvent): void {
        event.stopPropagation();
    }

    selectFolder(path: string): void {
        this.selectedPath.set(path);
        this.dropdownOpen.set(false);
    }

    isSelected(path: string): boolean {
        return this.selectedPath() === path;
    }

    toggleExpand(event: Event, node: FolderNode): void {
        event.stopPropagation();
        if (node.isExpanded) {
            node.isExpanded = false;
        } else {
            node.isExpanded = true;
            if (!node.isLoaded && node.hasChildren) {
                node.isLoading = true;
                this.loadLevel(node.path, node);
            }
        }
        this.rootNodes.update((n) => [...n]);
    }

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(true);
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        if (
            event.clientX <= rect.left ||
            event.clientX >= rect.right ||
            event.clientY <= rect.top ||
            event.clientY >= rect.bottom
        ) {
            this.isDragging.set(false);
        }
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        this.isDragging.set(false);
        const dropped = event.dataTransfer?.files;
        if (dropped?.length) {
            this.addFiles(Array.from(dropped));
        }
    }

    onFileInputChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            this.addFiles(Array.from(input.files));
            input.value = '';
        }
    }

    removeFile(index: number): void {
        this.files.update((list) => list.filter((_, i) => i !== index));
    }

    formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    onConfirm(): void {
        if (!this.isValid()) return;
        const destination = this.selectedPath();
        const subfolder = this.folderName().trim();
        const targetPath = subfolder ? (destination ? `${destination}/${subfolder}` : subfolder) : destination;
        const files = this.files();
        this.dialogRef.close({ targetPath, files, mkdirOnly: files.length === 0 });
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    private loadLevel(path: string, parent: FolderNode | null): void {
        this.storageApiService
            .list(path)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (items) => {
                    const folders = items
                        .filter((i) => i.type === 'folder')
                        .map(
                            (i): FolderNode => ({
                                name: i.name,
                                path: i.path || (path ? `${path}/${i.name}` : i.name),
                                level: parent ? parent.level + 1 : 0,
                                isExpanded: false,
                                isLoading: false,
                                hasChildren: !i.is_empty,
                                children: [],
                                isLoaded: false,
                            })
                        );

                    if (parent) {
                        parent.children = folders;
                        parent.isLoaded = true;
                        parent.isLoading = false;
                        parent.hasChildren = folders.length > 0;
                        if (folders.length === 0) parent.isExpanded = false;
                    } else {
                        this.rootNodes.set(folders);
                        this.isLoadingRoot.set(false);
                    }

                    this.rebuildAllNodes();
                    this.rootNodes.update((n) => [...n]);
                },
                error: () => {
                    if (parent) {
                        parent.isLoading = false;
                        parent.isLoaded = true;
                    } else {
                        this.isLoadingRoot.set(false);
                    }
                    this.rootNodes.update((n) => [...n]);
                },
            });
    }

    private buildVisible(nodes: FolderNode[]): FolderNode[] {
        const result: FolderNode[] = [];
        for (const node of nodes) {
            result.push(node);
            if (node.isExpanded && node.children.length > 0) {
                result.push(...this.buildVisible(node.children));
            }
        }
        return result;
    }

    private rebuildAllNodes(): void {
        this.allNodes.set(this.buildVisible(this.rootNodes()));
    }

    private addFiles(newFiles: File[]): void {
        this.files.update((existing) => {
            const names = new Set(existing.map((f) => f.name));
            return [...existing, ...newFiles.filter((f) => !names.has(f.name))];
        });
    }
}
