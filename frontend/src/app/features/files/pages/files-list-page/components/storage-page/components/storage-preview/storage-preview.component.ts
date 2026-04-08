import { DecimalPipe, JsonPipe } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    EventEmitter,
    inject,
    Input,
    OnChanges,
    Output,
    signal,
    SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { AppIconComponent } from '../../../../../../../../shared/components/app-icon/app-icon.component';
import { ButtonComponent } from '../../../../../../../../shared/components/buttons/button/button.component';
import { StorageItem } from '../../../../../../models/storage.models';
import { StorageApiService } from '../../../../../../services/storage-api.service';
import { getFileExtension } from '../../../../../../utils/storage-file.utils';

type PreviewType = 'text' | 'json' | 'pdf' | 'image' | 'unsupported';

@Component({
    selector: 'app-storage-preview',
    imports: [DecimalPipe, JsonPipe, AppIconComponent, ButtonComponent],
    templateUrl: './storage-preview.component.html',
    styleUrls: ['./storage-preview.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragePreviewComponent implements OnChanges {
    @Input() item: StorageItem | null = null;
    @Input() selectedItems: StorageItem[] = [];
    @Input() showSidebar = true;
    @Output() toggleSidebar = new EventEmitter<void>();
    @Output() contextAction = new EventEmitter<{ action: string; item: StorageItem; selectedItems?: StorageItem[] }>();

    private destroyRef = inject(DestroyRef);
    private storageApiService = inject(StorageApiService);
    private sanitizer = inject(DomSanitizer);

    previewType = signal<PreviewType>('unsupported');
    textContent = signal<string>('');
    jsonContent = signal<object | null>(null);
    pdfUrl = signal<SafeResourceUrl | null>(null);
    imageUrl = signal<string | null>(null);
    isLoadingPreview = signal<boolean>(false);
    previewError = signal<string | null>(null);

    kebabMenuOpen = signal<boolean>(false);
    kebabMenuPosition = signal<{ right: number; top: number }>({ right: 0, top: 0 });

    private currentBlobUrl: string | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['item']) {
            this.loadPreview();
        }
    }

    get breadcrumbs(): string[] {
        if (!this.item) return [];
        return this.item.path.split('/').filter(Boolean);
    }

    get hasFileSelected(): boolean {
        return !!this.item && this.item.type === 'file';
    }

    get fileExtension(): string {
        if (!this.item) return '';
        return getFileExtension(this.item.name);
    }

    get previewBadge(): string | null {
        switch (this.previewType()) {
            case 'text':
                return 'TXT';
            case 'json':
                return 'JSON';
            default:
                return null;
        }
    }

    onDownload(): void {
        if (this.item) {
            this.storageApiService.download(this.item.path);
        }
    }

    onKebabClick(event: MouseEvent): void {
        event.stopPropagation();
        const btn = event.currentTarget as HTMLElement;
        const rect = btn.getBoundingClientRect();
        this.kebabMenuPosition.set({ right: window.innerWidth - rect.right, top: rect.bottom + 4 });
        this.kebabMenuOpen.set(true);
    }

    closeKebabMenu(): void {
        this.kebabMenuOpen.set(false);
    }

    onKebabMenuAction(action: string): void {
        this.kebabMenuOpen.set(false);
        if (!this.item) return;
        if (action === 'download' && this.selectedItems.length > 1) {
            this.contextAction.emit({
                action: 'download-selected',
                item: this.item,
                selectedItems: this.selectedItems,
            });
        } else {
            this.contextAction.emit({ action, item: this.item });
        }
    }

    private loadPreview(): void {
        this.revokeCurrentBlob();
        this.textContent.set('');
        this.jsonContent.set(null);
        this.pdfUrl.set(null);
        this.imageUrl.set(null);
        this.previewError.set(null);

        const currentItem = this.item;
        if (!currentItem || currentItem.type === 'folder') {
            this.previewType.set('unsupported');
            return;
        }

        const ext = this.fileExtension;
        const type = this.resolvePreviewType(ext);
        this.previewType.set(type);

        if (type === 'unsupported') return;

        this.isLoadingPreview.set(true);
        this.storageApiService
            .downloadBlob(currentItem.path)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (blob) => this.handleBlob(blob, type),
                error: () => {
                    this.previewError.set('Failed to load file preview');
                    this.isLoadingPreview.set(false);
                },
            });
    }

    private handleBlob(blob: Blob, type: PreviewType): void {
        switch (type) {
            case 'text':
                blob.text().then((text) => {
                    this.textContent.set(text);
                    this.isLoadingPreview.set(false);
                });
                break;
            case 'json':
                blob.text().then((text) => {
                    try {
                        this.jsonContent.set(JSON.parse(text));
                    } catch {
                        this.textContent.set(text);
                        this.previewType.set('text');
                    }
                    this.isLoadingPreview.set(false);
                });
                break;
            case 'pdf': {
                const url = URL.createObjectURL(blob);
                this.currentBlobUrl = url;
                this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
                this.isLoadingPreview.set(false);
                break;
            }
            case 'image': {
                const url = URL.createObjectURL(blob);
                this.currentBlobUrl = url;
                this.imageUrl.set(url);
                this.isLoadingPreview.set(false);
                break;
            }
        }
    }

    private resolvePreviewType(ext: string): PreviewType {
        const textExts = ['txt', 'md', 'csv', 'log', 'py', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml'];
        const jsonExts = ['json'];
        const pdfExts = ['pdf'];
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

        if (textExts.includes(ext)) return 'text';
        if (jsonExts.includes(ext)) return 'json';
        if (pdfExts.includes(ext)) return 'pdf';
        if (imageExts.includes(ext)) return 'image';
        return 'unsupported';
    }

    private revokeCurrentBlob(): void {
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
    }
}
