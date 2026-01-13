import {OnInit, Component, ChangeDetectionStrategy, signal, inject, DestroyRef} from '@angular/core'
import {
    CollectionDetailsComponent
} from "./components/collection-details/collection-details.component";
import {
    CollectionsListItemSidebarComponent
} from "./components/collections-list-sidebar/collections-list-sidebar.component";
import {SpinnerComponent} from "../../../../shared/components/spinner/spinner.component";
import {Dialog} from "@angular/cdk/dialog";
import {
    CreateCollectionDialogComponent
} from "../../components/create-collection-dialog/create-collection-dialog.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CreateCollectionDtoResponse} from "../../models/collection.model";
import {CollectionsStorageService} from "../../services/collections-storage.service";
import {finalize, switchMap} from "rxjs/operators";
import {ToastService} from "../../../../services/notifications/toast.service";

@Component({
    selector: 'app-collections-list-page',
    templateUrl: './collections-list-page.component.html',
    styleUrls: ['./collections-list-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CollectionDetailsComponent,
        CollectionsListItemSidebarComponent,
        SpinnerComponent,
    ]
})
export class CollectionsListPageComponent implements OnInit {
    private destroyRef = inject(DestroyRef);
    private dialog = inject(Dialog);
    private collectionsStorageService = inject(CollectionsStorageService);
    private toastService = inject(ToastService);

    isLoading = signal<boolean>(true);
    collections = this.collectionsStorageService.collections;
    selectedCollectionId = signal<number | null>(null);

    ngOnInit(): void {
        this.getCollections();
    }

    getCollections(): void {
        this.isLoading.set(true);

        this.collectionsStorageService.getCollections()
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.isLoading.set(false)),
            )
            .subscribe({
                error: () => this.toastService.error('Failed to get collections.'),
            });
    }

    createCollection(): void {
        this.collectionsStorageService.createCollection()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (collection) => {
                        if (!collection) return;
                        this.openCreateModal(collection)
                },
                error: () => this.toastService.error('Failed to create collection')
            });
    }

    private openCreateModal(collection: CreateCollectionDtoResponse): void {
        const dialog = this.dialog.open(CreateCollectionDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: collection,
            disableClose: true
        });

        // Update collection info after modal closed
        dialog.closed
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                switchMap(() => {
                    return this.collectionsStorageService.getFullCollection(collection.collection_id, true)
                })
            )
            .subscribe({
                next: () => {
                    this.selectedCollectionId.set(collection.collection_id);
                },
                error: () => {
                    this.toastService.error('Failed to get collection data');
                }
            });
    }
}
