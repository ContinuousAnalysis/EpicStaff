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
    @Output() contextAction = new EventEmitter<{ action: string; item: StorageItem }>();
    closeSidebar = output<void>();
    openCreateFolder = output<string>();

    selectedPath = signal<string | null>(null);
    hoveredPath = signal<string | null>(null);
    renamingPath = signal<string | null>(null);
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
            this.selectedPath.set(item.path);
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
            this.renamingPath.set(item.path);
            this.renameValue = item.name;
        } else {
            this.contextAction.emit({ action, item });
        }
        this.closeContextMenu();
    }

    onRenameConfirm(item: StorageItem): void {
        const newName = this.renameValue.trim();
        if (newName && newName !== item.name) {
            const parentPath = item.path.substring(0, item.path.lastIndexOf('/'));
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            this.contextAction.emit({
                action: 'rename',
                item: { ...item, name: newName, path: newPath },
            });
        }
        this.renamingPath.set(null);
    }

    onRenameCancel(): void {
        this.renamingPath.set(null);
    }

    getFileExtension(name: string): string {
        const parts = name.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    getFileIcon(item: StorageItem): string {
        if (item.type === 'folder') {
            return item.isExpanded ? 'ui/folder-open' : 'ui/folder';
        }
        return 'ui/file';
    }

    onAddFolderClick(): void {
        const selected = this.selectedPath();
        const availableItems = this.asStorageItems(this.items);
        const currentFolder = selected
            ? availableItems.find((i) => i.path === selected)?.type === 'folder'
                ? selected
                : ''
            : '';
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
