import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';

export interface CreateFolderDialogData {
    /** Pre-fill the folder name field (e.g. when adding to an existing folder) */
    folderPath?: string;
}

export interface CreateFolderDialogResult {
    folderName: string;
    files: File[];
}

@Component({
    selector: 'app-create-folder-dialog',
    imports: [FormsModule, AppIconComponent],
    templateUrl: './create-folder-dialog.component.html',
    styleUrls: ['./create-folder-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateFolderDialogComponent {
    private dialogRef = inject(DialogRef<CreateFolderDialogResult>);
    private data: CreateFolderDialogData = inject(DIALOG_DATA, { optional: true }) ?? {};

    folderName = this.data.folderPath ?? '';
    isDragging = signal(false);
    files = signal<File[]>([]);

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
        const name = this.folderName.trim();
        if (!name) return;
        this.dialogRef.close({ folderName: name, files: this.files() });
    }

    onCancel(): void {
        this.dialogRef.close();
    }

    private addFiles(newFiles: File[]): void {
        this.files.update((existing) => {
            const names = new Set(existing.map((f) => f.name));
            return [...existing, ...newFiles.filter((f) => !names.has(f.name))];
        });
    }
}
