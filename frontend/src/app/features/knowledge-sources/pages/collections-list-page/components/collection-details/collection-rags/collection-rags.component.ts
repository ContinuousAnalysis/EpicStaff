import {ChangeDetectionStrategy, Component, inject, input} from "@angular/core";
import {AppIconComponent} from "../../../../../../../shared/components/app-icon/app-icon.component";
import {Dialog} from "@angular/cdk/dialog";
import {
    NaiveRagConfigurationDialog
} from "../../../../../components/naive-rag-configuration-dialog/naive-rag-configuration-dialog.component";
import {CreateCollectionDtoResponse} from "../../../../../models/collection.model";

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

    collection = input.required<CreateCollectionDtoResponse>();

    onConfigureNaiveRag() {
        const naiveRag = this.collection().rag_configurations.find(i => i.rag_type === 'naive');

        if (!naiveRag) return;

        this.dialog.open(NaiveRagConfigurationDialog, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
            data: {
                collection: this.collection(),
                ragId: naiveRag.rag_id
            },
            disableClose: true
        });
    }
}
