import { OverlayModule } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppIconComponent } from '../../../../../../../../shared/components/app-icon/app-icon.component';
import { StorageItem } from '../../../../../../models/storage.models';

@Component({
    selector: 'app-storage-tree',
    imports: [NgTemplateOutlet, FormsModule, AppIconComponent, OverlayModule],
    templateUrl: './storage-tree.component.html',
    styleUrls: ['./storage-tree.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageTreeComponent {
    @Input() items: StorageItem[] = [];
    @Output() fileSelected = new EventEmitter<StorageItem>();
    @Output() folderToggled = new EventEmitter<StorageItem>();
    @Output() contextAction = new EventEmitter<{
        action: string;
        item: StorageItem;
        renameFromPath?: string;
    }>();
    closeSidebar = output<void>();
    openCreateFolder = output<string>();

    selectedItem = signal<StorageItem | null>(null);
    hoveredItem = signal<StorageItem | null>(null);
    renamingItem = signal<StorageItem | null>(null);
    renameValue = '';

    contextMenuOpen = signal<boolean>(false);
    contextMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
    contextMenuItem = signal<StorageItem | null>(null);

    moreMenuOpen = signal<boolean>(false);
    moreMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });

    asStorageItems(nodes: StorageItem[] | null | undefined): StorageItem[] {
        return Array.isArray(nodes) ? nodes : [];
    }

    onItemClick(item: StorageItem): void {
        if (item.type === 'folder') {
            item.isExpanded = !item.isExpanded;
            this.folderToggled.emit(item);
        } else {
            this.selectedItem.set(item);
            this.fileSelected.emit(item);
        }
    }

    onContextMenu(event: MouseEvent, item: StorageItem): void {
        event.preventDefault();
        event.stopPropagation();
        this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
        this.contextMenuItem.set(item);
        this.contextMenuOpen.set(true);
    }

    onKebabClick(event: MouseEvent, item: StorageItem): void {
        event.stopPropagation();
        this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
        this.contextMenuItem.set(item);
        this.contextMenuOpen.set(true);
    }

    closeContextMenu(): void {
        this.contextMenuOpen.set(false);
        this.contextMenuItem.set(null);
    }

    onContextMenuAction(action: string): void {
        const item = this.contextMenuItem();
        if (!item) return;

        if (action === 'rename') {
            this.renamingItem.set(item);
            this.renameValue = item.name;
        } else {
            this.contextAction.emit({ action, item });
        }
        this.closeContextMenu();
    }

    onRenameConfirm(item: StorageItem): void {
        try {
            const newName = this.renameValue.trim();
            const currentName = item.name ?? '';
            if (newName && newName !== currentName) {
                const currentPath = item.path ?? '';
                const slashIndex = currentPath.lastIndexOf('/');
                const parentPath = slashIndex >= 0 ? currentPath.substring(0, slashIndex) : '';
                const newPath = parentPath ? `${parentPath}/${newName}` : newName;
                this.contextAction.emit({
                    action: 'rename',
                    item: { ...item, name: newName, path: newPath },
                    renameFromPath: currentPath,
                });
            }
        } finally {
            this.renamingItem.set(null);
        }
    }

    onRenameCancel(event?: Event): void {
        event?.preventDefault();
        event?.stopPropagation();
        this.renamingItem.set(null);
    }

    onRenameEnter(event: Event, item: StorageItem): void {
        event.preventDefault();
        event.stopPropagation();
        this.onRenameConfirm(item);
    }

    getFileExtension(name: string): string {
        const parts = name.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    getFileIcon(item: StorageItem): string {
        if (item.type === 'folder') {
            return 'ui/folder';
        }
        return 'ui/file';
    }

    onAddFolderClick(): void {
        const selected = this.selectedItem();
        const currentFolder = selected?.type === 'folder' && selected.path ? selected.path : '';
        this.openCreateFolder.emit(currentFolder);
    }

    onMoreOptionsClick(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const btn = event.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();
        const menuWidth = 180;
        const x = Math.min(rect.left, window.innerWidth - menuWidth - 8);
        const y = rect.bottom + 4;
        this.moreMenuPosition.set({ x, y });
        this.moreMenuOpen.set(true);
    }

    closeMoreMenu(): void {
        this.moreMenuOpen.set(false);
    }

    onMoreMenuAction(action: string): void {
        this.closeMoreMenu();
        if (action === 'create-folder') {
            this.openCreateFolder.emit('');
        } else {
            this.contextAction.emit({ action, item: { name: '', path: '', type: 'folder' } });
        }
    }

    trackByPath(_index: number, item: StorageItem): string {
        return item.path;
    }
}
