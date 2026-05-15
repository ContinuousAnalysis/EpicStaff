import { ChangeDetectionStrategy, Component, HostBinding, input, output, signal } from '@angular/core';

import { AppSvgIconComponent } from '../app-svg-icon/app-svg-icon.component';

@Component({
    selector: 'app-file-uploader',
    templateUrl: './file-uploader.component.html',
    styleUrls: ['./file-uploader.component.scss'],
    imports: [AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileUploaderComponent {
    accept = input('*');
    multiple = input(true);
    label = input('Drag and drop files here or click to upload');
    hint = input('');
    mod = input<'mb' | 'sm'>('mb');

    @HostBinding('class') get hostClass() {
        return `mod-${this.mod()}`;
    }

    isDragging = signal(false);

    filesUploaded = output<FileList>();
    filesRejected = output<void>();

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(true);
    }

    onDragLeave(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const { clientX, clientY } = event;

        if (clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom) {
            this.isDragging.set(false);
        }
    }

    onDrop(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(false);

        const dropped = Array.from(event.dataTransfer?.files ?? []);
        if (!dropped.length) return;

        const accepted = dropped.filter((f) => this.isAccepted(f));
        const rejected = dropped.filter((f) => !this.isAccepted(f));

        if (rejected.length) this.filesRejected.emit();

        if (accepted.length) {
            const dt = new DataTransfer();
            accepted.forEach((f) => dt.items.add(f));
            this.filesUploaded.emit(dt.files);
        }
    }

    private isAccepted(file: File): boolean {
        const acceptVal = this.accept().trim();
        if (!acceptVal || acceptVal === '*') return true;
        return acceptVal.split(',').some((token) => {
            const t = token.trim();
            if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t.toLowerCase());
            if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -1));
            return file.type === t;
        });
    }

    onFileSelect(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files) {
            this.filesUploaded.emit(input.files);
            input.value = '';
        }
    }
}
