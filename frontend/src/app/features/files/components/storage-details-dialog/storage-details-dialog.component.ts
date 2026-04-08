import { DIALOG_DATA, DialogModule, DialogRef } from '@angular/cdk/dialog';
import { DecimalPipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { StorageItemInfo } from '../../models/storage.models';

interface StorageDetailsDialogData extends StorageItemInfo {
    usedIn?: string[];
}

@Component({
    selector: 'app-storage-details-dialog',
    standalone: true,
    imports: [DialogModule, NgIf, DecimalPipe],
    templateUrl: './storage-details-dialog.component.html',
    styleUrls: ['./storage-details-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageDetailsDialogComponent {
    readonly dialogRef = inject(DialogRef<void>);
    readonly data = inject<StorageDetailsDialogData>(DIALOG_DATA);

    get addedAt(): string {
        return this.data.created || this.data.modified || '-';
    }

    get whereUsed(): string {
        if (this.data.usedIn?.length) {
            return this.data.usedIn.join(', ');
        }
        return 'Not used';
    }

    close(): void {
        this.dialogRef.close();
    }
}
