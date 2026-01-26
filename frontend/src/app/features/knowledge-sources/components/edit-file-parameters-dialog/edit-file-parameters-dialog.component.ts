import {ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal} from "@angular/core";
import {AppIconComponent, ButtonComponent} from "@shared/components";
import {DIALOG_DATA, DialogRef} from "@angular/cdk/dialog";
import {ChunkPreviewComponent} from "../chunk-preview/chunk-preview.component";
import {DocumentConfigComponent} from "./document-config/document-config.component";

@Component({
    selector: 'app-edit-file-parameters-dialog',
    templateUrl: './edit-file-parameters-dialog.component.html',
    styleUrls: ['./edit-file-parameters-dialog.component.scss'],
    imports: [
        AppIconComponent,
        ButtonComponent,
        ChunkPreviewComponent,
        DocumentConfigComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditFileParametersDialogComponent implements OnInit {
    private data: {currentId: number, currentIndex: number, allDocuments: number[]} = inject(DIALOG_DATA);
    private destroyRef = inject(DestroyRef);
    private dialogRef = inject(DialogRef);

    document = signal<any>({name: 'Test.pdf'})

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
