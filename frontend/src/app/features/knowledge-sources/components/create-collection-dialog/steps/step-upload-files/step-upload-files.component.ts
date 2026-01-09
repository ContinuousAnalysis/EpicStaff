import {ChangeDetectionStrategy, Component, inject, input, OnInit, model, DestroyRef} from "@angular/core";
import {FormControl, ReactiveFormsModule, Validators} from "@angular/forms";
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {UpperCasePipe} from "@angular/common";
import {CreateCollectionDtoResponse} from "../../../../models/collection.model";
import {MATERIAL_FORMS} from "../../../../../../shared/material-forms";
import {FileUploaderComponent} from "../../file-uploader/file-uploader.component";
import {FilesListComponent} from "./files-list/files-list.component";
import {FilePreviewComponent} from "./file-preview/file-preview.component";
import {CollectionsStorageService} from "../../../../services/collections-storage.service";
import {DocumentsStorageService} from "../../../../services/documents-storage.service";
import {DisplayedListDocument} from "../../../../models/document.model";
import {FILE_TYPES} from "../../../../constants/constants";
import {FileListService} from "../../../../services/files-list.service";

@Component({
    selector: "app-step-upload-files",
    templateUrl: "./step-upload-files.component.html",
    styleUrls: ["./step-upload-files.component.scss"],
    imports: [
        MATERIAL_FORMS,
        ReactiveFormsModule,
        FileUploaderComponent,
        FilesListComponent,
        FilePreviewComponent,
        UpperCasePipe
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StepUploadFilesComponent implements OnInit {
    private destroyRef = inject(DestroyRef);
    private collectionsStorageService = inject(CollectionsStorageService);
    private documentsStorageService = inject(DocumentsStorageService);
    private fileListService = inject(FileListService);

    collectionName: FormControl = new FormControl("", Validators.required);
    collection = input.required<CreateCollectionDtoResponse>();
    documents = model<DisplayedListDocument[]>([]);

    ngOnInit() {
        this.collectionName.setValue(this.collection().collection_name);

        this.collectionName?.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged(),
            switchMap((collection_name: string) => {
                const id = this.collection().collection_id;
                const body = { collection_name }

                return this.collectionsStorageService.updateCollectionById(id, body)
            }),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    onFilesUpload(files: FileList): void {
        const collectionId = this.collection().collection_id;
        // 1: filter duplicates by file name
        const filteredByName = this.fileListService.filterDuplicatesByName(files);
        // 2: transform File[] to DisplayedListDocument[]
        const transformed = this.fileListService.transformFilesToDisplayedDocuments(filteredByName, collectionId);
        // 3: display both valid and invalid files
        this.documents.update((d) => [...d, ...transformed]);
        // 4: filter valid files for upload to backend
        const toUpload = this.fileListService.filterValidFiles(filteredByName);
        if (!toUpload.length) {return;}
        // 5: upload filtered and valid files to backend
        this.documentsStorageService.uploadDocuments(collectionId, toUpload)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((res) => {
                if (!res) return;
                // 6: update displayed documents
                this.fileListService.updateDocumentsAfterUpload(this.documents, res.documents);
            });
    }

    protected readonly FILE_TYPES = FILE_TYPES;
}
