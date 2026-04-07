import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { StorageItem } from '../../../features/files/models/storage.models';
import { StorageApiService } from '../../../features/files/services/storage-api.service';
import { ToggleSwitchComponent } from '../../../shared/components/form-controls/toggle-switch/toggle-switch.component';

@Component({
    standalone: true,
    selector: 'app-node-storage-section',
    imports: [CommonModule, FormsModule, ToggleSwitchComponent],
    template: `
        <div class="storage-section">
            <div class="storage-header">
                <span class="section-label">Enable Storage</span>
                <app-toggle-switch [ngModel]="enabled()" (ngModelChange)="onToggle($event)"></app-toggle-switch>
            </div>

            @if (enabled()) {
                <div class="storage-fields">
                    <div class="select-field">
                        <label class="field-label">Action with Storage</label>
                        <select
                            class="select-input"
                            [ngModel]="selectedAction()"
                            (ngModelChange)="selectedAction.set($event)"
                            [style.--active-color]="activeColor()"
                        >
                            <option value="read">Read</option>
                            <option value="write">Write</option>
                        </select>
                    </div>

                    <div class="select-field">
                        <label class="field-label">Select files</label>
                        <select
                            class="select-input"
                            [ngModel]="selectedFile()"
                            (ngModelChange)="onFileSelect($event)"
                            [style.--active-color]="activeColor()"
                        >
                            <option value="">— Select a file —</option>
                            @for (item of allFiles(); track item.path) {
                                <option [value]="item.path">{{ item.path }}</option>
                            }
                        </select>
                    </div>

                    @if (inputMapKey()) {
                        <div class="input-map-preview">
                            <span class="field-label">Input map key</span>
                            <code class="input-map-key">input_map[ {{ inputMapKey() }} ]</code>
                        </div>
                    }

                    @if (previewCode()) {
                        <div class="code-preview">
                            <span class="field-label">Code preview</span>
                            <pre class="code-preview-text">{{ previewCode() }}</pre>
                        </div>
                    }

                    <button
                        type="button"
                        class="insert-btn"
                        [style.--active-color]="activeColor()"
                        [disabled]="!selectedFile()"
                        (click)="insertCode()"
                    >
                        Insert into code
                    </button>
                </div>
            }
        </div>
    `,
    styleUrl: './node-storage-section.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeStorageSectionComponent implements OnInit {
    readonly useStorage = input.required<boolean>();
    readonly activeColor = input<string>('#685fff');

    readonly onInsertCode = output<string>();
    readonly onToggleChange = output<boolean>();

    readonly enabled = signal<boolean>(false);
    readonly selectedAction = signal<'read' | 'write'>('read');
    readonly selectedFile = signal<string>('');
    readonly inputMapKey = signal<string>('');
    readonly allFiles = signal<StorageItem[]>([]);

    private filesLoaded = false;
    private readonly storageApiService = inject(StorageApiService);
    private readonly destroyRef = inject(DestroyRef);

    ngOnInit(): void {
        this.enabled.set(this.useStorage());
        if (this.enabled()) {
            this.loadFiles();
        }
    }

    onToggle(value: boolean): void {
        this.enabled.set(value);
        this.onToggleChange.emit(value);
        if (value) {
            this.loadFiles();
        }
    }

    onFileSelect(path: string): void {
        this.selectedFile.set(path);
        if (path) {
            const fileName = path.split('/').pop() ?? path;
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
            const snakeCase = nameWithoutExt.replace(/[\s\-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            this.inputMapKey.set(snakeCase);
        } else {
            this.inputMapKey.set('');
        }
    }

    previewCode(): string {
        if (!this.selectedFile()) return '';
        const action = this.selectedAction();
        const key = this.inputMapKey();
        const file = this.selectedFile();
        if (action === 'read') {
            return `from epicstaff_storage import storage\n\n${key}_content = storage.read(inputs["${key}"])`;
        } else {
            return `from epicstaff_storage import storage\n\nstorage.write("${file}", ${key})`;
        }
    }

    insertCode(): void {
        const code = this.previewCode();
        if (code) {
            this.onInsertCode.emit(code);
        }
    }

    private loadFiles(): void {
        if (this.filesLoaded) return;
        this.filesLoaded = true;
        this.storageApiService
            .list('')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((items) => this.allFiles.set(this.flattenFiles(items)));
    }

    private flattenFiles(items: StorageItem[]): StorageItem[] {
        const result: StorageItem[] = [];
        for (const item of items) {
            if (item.type === 'file') {
                result.push(item);
            } else if (item.children?.length) {
                result.push(...this.flattenFiles(item.children));
            }
        }
        return result;
    }
}
