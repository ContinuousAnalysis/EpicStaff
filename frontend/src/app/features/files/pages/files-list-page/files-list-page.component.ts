import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ToastService } from '../../../../services/notifications/toast.service';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { TabButtonComponent } from '../../../../shared/components/tab-button/tab-button.component';
import { HideInlineSubtitleOnOverflowDirective } from '../../../../shared/directives/hide-inline-subtitle-on-overflow.directive';
import {
    CreateFolderDialogComponent,
    CreateFolderDialogResult,
} from '../../components/create-folder-dialog/create-folder-dialog.component';
import { StorageApiService } from '../../services/storage-api.service';

@Component({
    selector: 'app-files-list-page',
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        TabButtonComponent,
        ButtonComponent,
        FormsModule,
        AppIconComponent,
        HideInlineSubtitleOnOverflowDirective,
    ],
    templateUrl: './files-list-page.component.html',
    styleUrls: ['./files-list-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesListPageComponent {
    private readonly dialog = inject(Dialog);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly storageApiService = inject(StorageApiService);
    private readonly toastService = inject(ToastService);

    public tabs = [
        { label: 'Knowledge Sources', link: 'knowledge-sources' },
        { label: 'Storage', link: 'storage' },
    ];

    public searchTerm: string = '';

    public get isStorageTabActive(): boolean {
        return this.router.url.includes('/storage');
    }

    public onSearchTermChange(term: string): void {
        this.searchTerm = term;
    }

    public clearSearch(): void {
        this.searchTerm = '';
    }

    public onCreateFolderClick(): void {
        const dialogRef = this.dialog.open<CreateFolderDialogResult>(CreateFolderDialogComponent);

        dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
            if (!result) return;
            this.storageApiService.mkdir(result.folderName).subscribe({
                next: () => {
                    this.toastService.success(`Folder "${result.folderName}" created`);
                    this.storageApiService.triggerRefresh();
                    result.files.forEach((file) => {
                        this.storageApiService.upload(result.folderName, file).subscribe({
                            next: () => {
                                this.toastService.success(`"${file.name}" uploaded`);
                                this.storageApiService.triggerRefresh();
                            },
                            error: () => this.toastService.error(`Failed to upload "${file.name}"`),
                        });
                    });
                },
                error: () => {
                    this.toastService.error('Failed to create folder');
                },
            });
        });
    }
}
