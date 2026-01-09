import {ChangeDetectionStrategy, Component, DestroyRef, inject} from "@angular/core";
import {CreateCollectionDtoResponse} from "../../models/collection.model";
import {DIALOG_DATA, DialogRef} from "@angular/cdk/dialog";
import {AppIconComponent} from "../../../../shared/components/app-icon/app-icon.component";
import {RagConfigurationComponent} from "../rag-configuration/rag-configuration.component";

@Component({
    selector: 'app-naive-rag-configuration-dialog',
    templateUrl: './naive-rag-configuration-dialog.component.html',
    styleUrls: ['./naive-rag-configuration-dialog.component.scss'],
    imports: [
        AppIconComponent,
        RagConfigurationComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NaiveRagConfigurationDialog {
    data: { collection: CreateCollectionDtoResponse, ragId: number } = inject(DIALOG_DATA);
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);

    onCancel(): void {
        this.dialogRef.close();
    }
}
