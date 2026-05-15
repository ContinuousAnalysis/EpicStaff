import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { AppSvgIconComponent } from '../app-svg-icon/app-svg-icon.component';

@Component({
    selector: 'app-drag-drop-area',
    templateUrl: './drag-drop-area.component.html',
    styleUrls: ['./drag-drop-area.component.scss'],
    imports: [AppSvgIconComponent, UpperCasePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DragDropAreaComponent {
    filesDropped = output<FileList>();
    isDragging = signal<boolean>(false);
    allowedTypes = input<readonly string[]>([]);

    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.isDragging.set(this.isExternalFileDrag(event));
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

        if (!this.isExternalFileDrag(event)) {
            return;
        }

        if (event.dataTransfer?.files.length) {
            this.filesDropped.emit(event.dataTransfer.files);
        }
    }

    private isExternalFileDrag(event: DragEvent): boolean {
        const types = event.dataTransfer?.types;
        if (!types || !Array.from(types).includes('Files')) {
            return false;
        }
        for (const type of Array.from(types)) {
            if (type !== 'Files' && type !== 'application/x-moz-file') {
                return false;
            }
        }
        return true;
    }
}
