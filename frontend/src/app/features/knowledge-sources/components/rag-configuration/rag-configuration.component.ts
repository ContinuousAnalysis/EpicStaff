import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    input,
    OnInit,
    signal,
} from "@angular/core";
import {FormsModule} from "@angular/forms";
import {SearchComponent, AppIconComponent, SelectComponent, SelectItem} from "@shared/components";
import {ConfigurationTableComponent} from "./configuration-table/configuration-table.component";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {CreateCollectionDtoResponse} from "../../models/collection.model";
import {NaiveRagService} from "../../services/naive-rag.service";
import {NaiveRagDocumentConfig} from "../../models/rag.model";
import {ToastService} from "../../../../services/notifications";
import {ChunkPreviewComponent} from "../chunk-preview/chunk-preview.component";

@Component({
    selector: 'app-rag-configuration',
    templateUrl: './rag-configuration.component.html',
    styleUrls: ['./rag-configuration.component.scss'],
    imports: [
        FormsModule,
        SearchComponent,
        SelectComponent,
        ConfigurationTableComponent,
        AppIconComponent,
        ChunkPreviewComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RagConfigurationComponent implements OnInit {
    searchTerm = signal<string>('');
    collection = input.required<CreateCollectionDtoResponse>();
    naiveRagId = input.required<number>();
    selectedDocumentId = signal<number | null>(null);

    checkedCount = signal<number>(0);
    allowBulkEdit = input<boolean>(false);
    documents = signal<NaiveRagDocumentConfig[]>([]);

    private naiveRagService = inject(NaiveRagService);
    private destroyRef = inject(DestroyRef);
    private toastService = inject(ToastService);

    bulkActionItems: SelectItem[] = [
        {
            name: 'Bulk configuration',
            value: 'edit'
        },
        {
            name: 'Remove file from RAG',
            value: 'delete'
        },
    ];

    bulkAction = signal<'edit' | 'delete' | null>(null);

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
}
