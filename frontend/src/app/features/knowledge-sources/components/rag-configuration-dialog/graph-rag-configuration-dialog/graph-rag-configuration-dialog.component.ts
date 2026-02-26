import { ChangeDetectionStrategy, Component, inject, OnInit, signal, ViewChild } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ButtonComponent } from "@shared/components";
import { CollectionGraphRag } from "../../../models/graph-rag.model";
import { GraphRagService } from "../../../services/graph-rag.service";
import { GraphRagConfigurationComponent } from "../../graph-rag-configuration/graph-rag-configuration.component";
import { RagConfigurationDialogComponent } from "../rag-configuration-dialog.component";

@Component({
    selector: 'app-graph-rag-configuration-dialog',
    templateUrl: './graph-rag-configuration-dialog.component.html',
    styleUrls: ['../rag-configuration-dialog.component.scss'],
    imports: [
        ButtonComponent,
        GraphRagConfigurationComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GraphRagConfigurationDialog extends RagConfigurationDialogComponent implements OnInit {
    private graphRagService = inject(GraphRagService);

    graphRag = signal<CollectionGraphRag | null>(null);

    @ViewChild('ragConfig') ragConfig!: GraphRagConfigurationComponent;

    ngOnInit() {
        const id = this.data.ragId;
        this.graphRagService.getRagById(id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(graphRag => this.graphRag.set(graphRag));
    }

    onClose() {
        this.dialogRef.close();
    }

    runIndexing() {
        const ref = this.ragConfig;
        if (!ref) return;

        const data = ref.getConfigurationData();
        if (!data) return;

        const ragId = this.data.ragId;
        this.graphRagService.startIndexing(ragId, data)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: () => this.toast.success('Files re-indexed successfully'),
                error: () => this.toast.error('Files re-indexing failed'),
            })
    }
}
