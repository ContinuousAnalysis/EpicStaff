import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, ViewChild } from '@angular/core';

import { AppIconComponent } from '../../../../../../../../shared/components/app-icon/app-icon.component';
import { StorageItem } from '../../../../../../models/storage.models';
import { getFileExtension } from '../../../../../../utils/storage-file.utils';

@Component({
    selector: 'app-storage-tree',
    imports: [NgTemplateOutlet, AppIconComponent],
    templateUrl: './storage-tree.component.html',
    styleUrls: ['./storage-tree.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageTreeComponent {
    items = input<StorageItem[]>([]);
    fileSelected = output<StorageItem>();
    folderSelected = output<StorageItem>();
    folderToggled = output<StorageItem>();
    contextAction = output<{
        action: string;
        item: StorageItem;
        selectedItems?: StorageItem[];
        renameFromPath?: string;
    }>();
    closeSidebar = output<void>();
    openCreateFolder = output<string>();
    selectionChange = output<StorageItem[]>();

    @ViewChild('renameInput') renameInputRef?: ElementRef<HTMLInputElement>;

    selectedItem = signal<StorageItem | null>(null);
    selectedPaths = signal<Set<string>>(new Set<string>());
    hoveredItem = signal<StorageItem | null>(null);
    renamingItem = signal<StorageItem | null>(null);
    renamingFromPath = '';
    renameValue = '';
    private selectionAnchorPath: string | null = null;

    contextMenuOpen = signal<boolean>(false);
    contextMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
    contextMenuItem = signal<StorageItem | null>(null);

    moreMenuOpen = signal<boolean>(false);
    moreMenuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });

    asStorageItems(nodes: StorageItem[] | null | undefined): StorageItem[] {
        return Array.isArray(nodes) ? nodes : [];
    }

    onItemClick(event: MouseEvent, item: StorageItem): void {
        this.updateSelection(event, item);
        this.selectedItem.set(item);
        const hasModifier = event.ctrlKey || event.metaKey || event.shiftKey;
        if (hasModifier) {
            return;
        }
        if (item.type === 'file') {
            this.fileSelected.emit(item);
        } else {
            this.folderSelected.emit(item);
        }
    }

    onFolderChevronClick(event: MouseEvent, item: StorageItem): void {
        event.preventDefault();
        event.stopPropagation();
        item.isExpanded = !item.isExpanded;
        this.folderToggled.emit(item);
    }

    onContextMenu(event: MouseEvent, item: StorageItem): void {
        event.preventDefault();
        event.stopPropagation();
        if (!this.isItemSelected(item)) {
            this.setSelectedPaths(new Set([item.path]));
            this.selectedItem.set(item);
            this.selectionAnchorPath = item.path;
        }
        this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
        this.contextMenuItem.set(item);
        this.contextMenuOpen.set(true);
    }

    onKebabClick(event: MouseEvent, item: StorageItem): void {
        event.stopPropagation();
        this.setSelectedPaths(new Set([item.path]));
        this.selectedItem.set(item);
        this.selectionAnchorPath = item.path;
        this.contextMenuPosition.set({ x: event.clientX, y: event.clientY });
        this.contextMenuItem.set(item);
        this.contextMenuOpen.set(true);
    }

    closeContextMenu(): void {
        this.contextMenuOpen.set(false);
        this.contextMenuItem.set(null);
    }

    startRename(item: StorageItem): void {
        this.renamingFromPath = item.path || item.name;
        this.renameValue = item.name;
        this.renamingItem.set(item);
        setTimeout(() => {
            this.renameInputRef?.nativeElement.focus();
            this.renameInputRef?.nativeElement.select();
        });
    }

    onContextMenuAction(action: string): void {
        const item = this.contextMenuItem();
        if (!item) return;

        if (action === 'rename') {
            this.startRename(item);
        } else {
            this.contextAction.emit({ action, item });
        }
        this.closeContextMenu();
    }

    onRenameConfirm(): void {
        const item = this.renamingItem();
        if (!item) {
            return;
        }
        this.renamingItem.set(null);

        const newName = this.renameValue.trim();
        const currentPath = this.renamingFromPath;
        if (newName && newName !== item.name) {
            const slashIndex = currentPath.lastIndexOf('/');
            const parentPath = slashIndex >= 0 ? currentPath.substring(0, slashIndex) : '';
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            this.contextAction.emit({
                action: 'rename',
                item: { ...item, name: newName, path: newPath },
                renameFromPath: currentPath,
            });
        }
    }

    onRenameCancel(event?: Event): void {
        event?.preventDefault();
        event?.stopPropagation();
        this.renamingItem.set(null);
    }

    onRenameEnter(event: Event): void {
        event.preventDefault();
        event.stopPropagation();
        this.onRenameConfirm();
    }

    getFileIcon(item: StorageItem): string {
        if (item.type === 'folder') {
            return item.is_empty ? 'ui/folder-storage-empty' : 'ui/folder-storage';
        }
        const ext = getFileExtension(item.name);
        if (ext === 'txt') return 'ui/file-txt';
        if (ext === 'pdf') return 'ui/file-pdf';
        if (ext === 'docx') return 'ui/file-docx';
        if (ext === 'json') return 'ui/file-json';
        if (ext === 'html') return 'ui/file-html';
        return 'ui/file';
    }

    isItemSelected(item: StorageItem): boolean {
        return this.selectedPaths().has(item.path);
    }

    onAddFolderClick(): void {
        const selected = this.selectedItem();
        let currentFolder = '';
        if (selected?.path) {
            if (selected.type === 'folder') {
                currentFolder = selected.path;
            } else {
                const slashIndex = selected.path.lastIndexOf('/');
                currentFolder = slashIndex >= 0 ? selected.path.substring(0, slashIndex) : '';
            }
        }
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
        const selectedSet = this.selectedPaths();
        const selectedItems = this.collectVisibleNodes(this.items()).filter((node) => selectedSet.has(node.path));
        if ((action === 'download-selected' || action === 'delete-selected') && selectedItems.length === 0) {
            return;
        }
        this.contextAction.emit({
            action,
            item: selectedItems[0] ?? this.selectedItem() ?? { name: '', path: '', type: 'folder' },
            selectedItems,
        });
    }

    trackByPath(_index: number, item: StorageItem): string {
        return item.path;
    }

    private updateSelection(event: MouseEvent, item: StorageItem): void {
        const path = item.path;
        const isCtrlOrMeta = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;
        const currentSelection = new Set(this.selectedPaths());

        if (isShift && this.selectionAnchorPath) {
            const visibleNodes = this.collectVisibleNodes(this.items());
            const startIndex = visibleNodes.findIndex((n) => n.path === this.selectionAnchorPath);
            const endIndex = visibleNodes.findIndex((n) => n.path === path);
            if (startIndex !== -1 && endIndex !== -1) {
                const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
                const ranged = visibleNodes.slice(from, to + 1);
                this.setSelectedPaths(new Set(ranged.map((n) => n.path)));
                return;
            }
        }

        if (isCtrlOrMeta) {
            if (currentSelection.has(path)) {
                currentSelection.delete(path);
            } else {
                currentSelection.add(path);
            }
            this.setSelectedPaths(currentSelection);
            this.selectionAnchorPath = path;
            return;
        }

        this.setSelectedPaths(new Set([path]));
        this.selectionAnchorPath = path;
    }

    private setSelectedPaths(paths: Set<string>): void {
        this.selectedPaths.set(paths);
        const visible = this.collectVisibleNodes(this.items());
        this.selectionChange.emit(visible.filter((n) => paths.has(n.path)));
    }

    private collectVisibleNodes(nodes: StorageItem[]): StorageItem[] {
        const flat: StorageItem[] = [];
        for (const node of nodes) {
            flat.push(node);
            if (node.type === 'folder' && node.isExpanded && node.children?.length) {
                flat.push(...this.collectVisibleNodes(node.children));
            }
        }
        return flat;
    }
}
