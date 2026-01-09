import {
    ChangeDetectionStrategy,
    Component, computed,
    DestroyRef,
    inject,
    model, OnChanges,
    OnInit,
    signal, SimpleChanges
} from "@angular/core";
import {AppIconComponent} from "../../../../../../shared/components/app-icon/app-icon.component";
import {FormControl, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {CreateCollectionDtoResponse} from "../../../../models/collection.model";
import {CollectionsStorageService} from "../../../../services/collections-storage.service";
import {debounceTime, distinctUntilChanged, finalize, map, switchMap} from "rxjs/operators";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {filter} from "rxjs";
import {DragDropAreaComponent} from "../../../../../../shared/components/drag-drop-area/drag-drop-area.component";
import {FILE_TYPES} from "../../../../constants/constants";
import {CollectionFilesComponent} from "./collection-files/collection-files.component";
import {SelectComponent} from "../../../../../../shared/components/select/select.component";
import {CollectionRagsComponent} from "./collection-rags/collection-rags.component";
import {CollectionInfoComponent} from "./collection-info/collection-info.component";
import {DocumentsStorageService} from "../../../../services/documents-storage.service";
import {CollectionDocument, DisplayedListDocument} from "../../../../models/document.model";
import {FileListService} from "../../../../services/files-list.service";
import {SpinnerComponent} from "../../../../../../shared/components/spinner/spinner.component";

@Component({
    selector: "app-collection-details",
    styleUrls: ["./collection-details.component.scss"],
    templateUrl: "./collection-details.component.html",
    imports: [
        AppIconComponent,
        FormsModule,
        ReactiveFormsModule,
        DragDropAreaComponent,
        CollectionFilesComponent,
        SelectComponent,
        CollectionRagsComponent,
        CollectionInfoComponent,
        SpinnerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionDetailsComponent implements OnInit, OnChanges {
    private destroyRef = inject(DestroyRef);
    selectedCollectionId = model<number | null>(null);
    loadingCollection = signal<boolean>(false);
    loadingDocuments = signal<boolean>(false);
    fullCollection = signal<CreateCollectionDtoResponse | null>(null);
    documents = signal<DisplayedListDocument[]>([]);
    documentTypes = computed(() => {
        const types = new Set<string>();

        this.documents().forEach(doc => {
            doc.file_type && types.add(doc.file_type);
        })
        return Array.from(types);
    });
    collectionName: FormControl = new FormControl("", Validators.required);

    private collectionsStorageService = inject(CollectionsStorageService);
    private documentsStorageService = inject(DocumentsStorageService);
    private fileListService = inject(FileListService)

    ngOnChanges(changes: SimpleChanges) {
        const id = changes['selectedCollectionId'].currentValue;
        if (!id) return;

        this.getCollectionData(id);
        this.getCollectionDocuments(id);
    }

    ngOnInit() {
        this.collectionName.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged(),
            filter(() => !!this.fullCollection()),
            switchMap((collection_name: string) => {
                const id = this.fullCollection()!.collection_id;
                return this.collectionsStorageService.updateCollectionById(id, { collection_name });
            }),
            takeUntilDestroyed(this.destroyRef)
        ).subscribe();
    }

    private getCollectionData(id: number): void {
        this.loadingCollection.set(true);
        this.collectionsStorageService.getFullCollection(id)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.loadingCollection.set(false))
            )
            .subscribe(c => {
                this.fullCollection.set(c);
                this.collectionName.setValue(this.fullCollection()?.collection_name, {emitEvent: false});
            });
    }

    private getCollectionDocuments(id: number): void {
        this.loadingDocuments.set(true);
        this.documentsStorageService.getDocumentsByCollectionId(id)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => this.loadingDocuments.set(false)),
                map((items: CollectionDocument[]): DisplayedListDocument[] => {
                    return items.map((d) => ({
                        ...d,
                        isValidType: true,
                        isValidSize: true
                    }))
                })
            )
            .subscribe(docs => {
                this.documents.set(docs);
            });
    }

    onCollectionDelete(): void {
        const id = this.fullCollection()?.collection_id;
        if (id) {
            this.collectionsStorageService.deleteCollectionById(id)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((res) => {
                    if (!res) return;
                    this.selectedCollectionId.set(null);
                    this.fullCollection.set(null);
                });
        }
    }

    onFilesDropped(files: FileList) {
        const collectionId = this.fullCollection()?.collection_id;
        if (!collectionId) return;
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

    onFileSelect(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files) {
            this.onFilesDropped(input.files);
        }
    }

    protected readonly FILE_TYPES = FILE_TYPES;
}
