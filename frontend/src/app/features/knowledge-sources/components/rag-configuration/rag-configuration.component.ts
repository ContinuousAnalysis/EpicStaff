import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    input,
    OnInit,
    signal, ViewChild,
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {SearchComponent, AppIconComponent, SelectComponent, ButtonComponent} from "@shared/components";
import {ConfigurationTableComponent} from "./configuration-table/configuration-table.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CreateCollectionDtoResponse} from "../../models/collection.model";
import {NaiveRagService} from "../../services/naive-rag.service";
import {NaiveRagDocumentConfig} from "../../models/rag.model";
import {ToastService} from "../../../../services/notifications";
import {ChunkPreviewComponent} from "../chunk-preview/chunk-preview.component";
import {switchMap} from "rxjs/operators";
import {EMPTY} from "rxjs";

@Component({
    selector: 'app-rag-configuration',
    templateUrl: './rag-configuration.component.html',
    styleUrls: ['./rag-configuration.component.scss'],
    imports: [
        FormsModule,
        SearchComponent,
        ConfigurationTableComponent,
        AppIconComponent,
        ChunkPreviewComponent,
        ButtonComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RagConfigurationComponent implements OnInit {
    searchTerm = signal<string>('');
    collection = input.required<CreateCollectionDtoResponse>();
    naiveRagId = input.required<number>();
    selectedDocumentId = signal<number | null>(null);

    checkedCount = signal<number>(0);
    documents = signal<NaiveRagDocumentConfig[]>([]);

    private naiveRagService = inject(NaiveRagService);
    private destroyRef = inject(DestroyRef);
    private toastService = inject(ToastService);

    @ViewChild(ConfigurationTableComponent) configTableComponent!: ConfigurationTableComponent;

    showBulkRow = signal<boolean>(false);

    ngOnInit() {
        const id = this.naiveRagId();

        this.naiveRagService.getDocumentConfigs(id).pipe(
            takeUntilDestroyed(this.destroyRef)
        ).subscribe({
            next: ({configs}) => {
                this.documents.set(configs)
            },
            error: (e) => {
                this.toastService.error('Failed to fetch documents');
                console.log(e)
            }
        });
    }

    initFiles() {
        const id = this.naiveRagId();

        this.naiveRagService.initializeDocuments(id)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                switchMap((response) => {
                    if (response && response.configs_created > 0) {
                        return this.naiveRagService.getDocumentConfigs(id);
                    } else {
                        return EMPTY;
                    }
                })
            )
            .subscribe({
                next: ({configs}) => this.documents.set(configs),
                error: (err) => console.error(err)
            });
    }

    deleteDocuments() {
        this.configTableComponent.applyBulkDelete();
    }
}
