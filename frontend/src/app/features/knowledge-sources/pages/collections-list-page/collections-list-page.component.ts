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
                finalize(() => this.isLoading.set(false))
            )
            .subscribe();
    }

    createCollection(): void {
        this.collectionsStorageService.createCollection()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((collection) => {
                if (!collection) return;
                this.openCreateModal(collection)
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
                }
            });
    }
}
