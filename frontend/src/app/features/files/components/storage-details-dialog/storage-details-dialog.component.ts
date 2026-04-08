import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { StorageItemInfo } from '../../models/storage.models';

interface StorageDetailsDialogData extends StorageItemInfo {
    usedIn?: string[];
}

@Component({
    selector: 'app-storage-details-dialog',
    standalone: true,
    imports: [AppIconComponent],
    templateUrl: './storage-details-dialog.component.html',
    styleUrls: ['./storage-details-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageDetailsDialogComponent {
    readonly dialogRef = inject(DialogRef<void>);
    readonly data = inject<StorageDetailsDialogData>(DIALOG_DATA);

    get modifiedAt(): string {
        return this.formatDate(this.data.modified);
    }

    get usedInFlows(): string[] {
        return this.data.usedIn?.length ? this.data.usedIn : [];
    }

    get title(): string {
        return this.data.type === 'folder' ? 'Folder Details' : 'File Details';
    }

    get typeLabel(): string {
        if (this.data.type === 'folder') {
            return 'folder';
        }
        const ext = this.data.name?.split('.').pop()?.toLowerCase();
        return ext || 'file';
    }

    get sizeLabel(): string {
        const size = this.data.size ?? 0;
        if (size >= 1024 * 1024) {
            return `${(size / (1024 * 1024)).toFixed(1)} MB`;
        }
        if (size >= 1024) {
            return `${Math.round(size / 1024)} KB`;
        }
        return `${size} B`;
    }

    get storagePath(): string {
        const path = this.data.path?.replace(/^\/+/, '') ?? '';
        return path;
    }

    async copyPath(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.storagePath);
        } catch {
            // no-op
        }
    }

    close(): void {
        this.dialogRef.close();
    }

    private formatDate(value?: string): string {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}
