import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { take } from 'rxjs';

import { AppSvgIconComponent } from '../app-svg-icon/app-svg-icon.component';
import { FileUploaderComponent } from '../file-uploader/file-uploader.component';
import { ImageCropperDialogComponent } from './image-cropper-dialog/image-cropper-dialog.component';

@Component({
    selector: 'app-avatar-upload',
    templateUrl: './avatar-upload.component.html',
    styleUrls: ['./avatar-upload.component.scss'],
    imports: [FileUploaderComponent, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarUploadComponent {
    private dialog = inject(Dialog);
    private destroyRef = inject(DestroyRef);

    readonly selectedFile = signal<File | null>(null);
    readonly previewUrl = signal<string | null>(null);

    readonly fileSizeLabel = computed(() => {
        const size = this.selectedFile()?.size ?? 0;
        if (size >= 1024 * 1024) {
            return `${(size / 1024 / 1024).toFixed(1)} MB`;
        }
        return `${Math.round(size / 1024)} KB`;
    });

    imageChange = output<File | null>();

    constructor() {
        this.destroyRef.onDestroy(() => this.revokePreviewUrl());
    }

    onFilesUploaded(files: FileList): void {
        const file = files[0];
        if (!file) return;

        this.dialog
            .open<File | null>(ImageCropperDialogComponent, { data: { file } })
            .closed.pipe(take(1))
            .subscribe((croppedFile) => {
                if (croppedFile) {
                    this.revokePreviewUrl();
                    this.selectedFile.set(croppedFile);
                    this.previewUrl.set(URL.createObjectURL(croppedFile));
                    this.imageChange.emit(croppedFile);
                }
            });
    }

    onClear(): void {
        this.revokePreviewUrl();
        this.selectedFile.set(null);
        this.imageChange.emit(null);
    }

    private revokePreviewUrl(): void {
        const url = this.previewUrl();
        if (url) {
            URL.revokeObjectURL(url);
            this.previewUrl.set(null);
        }
    }
}
