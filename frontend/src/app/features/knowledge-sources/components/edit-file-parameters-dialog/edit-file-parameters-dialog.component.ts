import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { AppIconComponent } from "@shared/components";
import { DIALOG_DATA, DialogRef } from "@angular/cdk/dialog";
import { DocumentChunksSectionComponent } from "../document-chunks-section/document-chunks-section.component";
import { DocumentConfigComponent } from "./document-config/document-config.component";

@Component({
    selector: 'app-edit-file-parameters-dialog',
    templateUrl: './edit-file-parameters-dialog.component.html',
    styleUrls: ['./edit-file-parameters-dialog.component.scss'],
    imports: [
        AppIconComponent,
        DocumentConfigComponent,
        DocumentChunksSectionComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditFileParametersDialogComponent implements OnInit {
    readonly data: { ragId: number } = inject(DIALOG_DATA);
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);

    document = signal<any>({ name: 'Test.pdf' })

    // TODO keep documents in service
    ngOnInit() {
        console.log(this.data);
    }

    nextDocument() {

    }

    prevDocument() {

    }

    onClose() {
        this.dialogRef.close();
    }
}
