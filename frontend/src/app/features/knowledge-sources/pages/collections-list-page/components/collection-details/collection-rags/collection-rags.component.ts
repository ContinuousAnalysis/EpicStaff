import {ChangeDetectionStrategy, Component, DestroyRef, inject, input} from "@angular/core";
import {AppIconComponent} from "../../../../../../../shared/components/app-icon/app-icon.component";
import {Dialog} from "@angular/cdk/dialog";
import {
    NaiveRagConfigurationDialog
} from "../../../../../components/naive-rag-configuration-dialog/naive-rag-configuration-dialog.component";
import {CreateCollectionDtoResponse} from "../../../../../models/collection.model";
import {
    CreateCollectionDialogComponent
} from "../../../../../components/create-collection-dialog/create-collection-dialog.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CollectionsStorageService} from "../../../../../services/collections-storage.service";
import {catchError, filter, switchMap} from "rxjs/operators";
import {ToastService} from "../../../../../../../services/notifications/toast.service";
import {throwError} from "rxjs";
import {NaiveRagService} from "../../../../../services/naive-rag.service";

@Component({
    selector: 'app-collection-details-rags',
    templateUrl: 'collection-rags.component.html',
    styleUrls: ['./collection-rags.component.scss'],
    imports: [
        AppIconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionRagsComponent {
    private dialog = inject(Dialog);
    private destroyRef = inject(DestroyRef);
    private collectionsStorageService = inject(CollectionsStorageService);
    private naiveRagService = inject(NaiveRagService);
    private toastService = inject(ToastService);

    collection = input.required<CreateCollectionDtoResponse>();

    onConfigureNaiveRag() {
        if (!this.collection().rag_configurations.length) {
            this.openCollectionModal();
            return;
        }

        const naiveRag = this.collection().rag_configurations.find(i => i.rag_type === 'naive');

        if (!naiveRag) return;

        const dialog = this.dialog.open(NaiveRagConfigurationDialog, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: {
                collection: this.collection(),
                ragId: naiveRag.rag_id
            },
            disableClose: true
        });

        dialog.closed
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                filter(Boolean),
                switchMap(() => {
                    return this.naiveRagService.startIndexing({
                        rag_id: naiveRag.rag_id,
                        rag_type: naiveRag.rag_type
                    })
                })
            )
            .subscribe()
    }

    private openCollectionModal(): void {
        const dialog = this.dialog.open(CreateCollectionDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: this.collection().collection_id,
            disableClose: true
        });

        dialog.closed
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                switchMap(() => {
                    return this.collectionsStorageService.getFullCollection(this.collection().collection_id, true)
                }),
                catchError((error) => {
                    this.toastService.error('Failed to get collection data')
                    return throwError(() => error)
                })
            )
            .subscribe();
    }
}
