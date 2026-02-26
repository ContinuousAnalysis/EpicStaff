import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal, ViewChild } from "@angular/core";
import { RadioButtonComponent, SelectItem } from "@shared/components";
import { MATERIAL_FORMS } from "@shared/material-forms";
import { ToastService } from "../../../../services/notifications";
import { CollectionGraphRag, CreateGraphRagIndexConfigRequest, GraphRagFileType } from "../../models/graph-rag.model";
import { RagConfiguration } from "../../models/rag-configuration";
import { GraphRagFilesListComponent } from "./files-list/files-list.component";
import { AppGraphRagParametersComponent } from "./index-parameters/index-parameters.component";

@Component({
    selector: 'app-graph-rag-configuration',
    templateUrl: './graph-rag-configuration.component.html',
    styleUrls: ['./graph-rag-configuration.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        RadioButtonComponent,
        GraphRagFilesListComponent,
        MATERIAL_FORMS,
        AppGraphRagParametersComponent
    ]
})
export class GraphRagConfigurationComponent implements OnInit, RagConfiguration {
    private toastService = inject(ToastService);

    graphRag = input.required<CollectionGraphRag>();

    selectedFormat = signal<GraphRagFileType>('text');

    formatOptions: SelectItem[] = [
        {
            name: 'TXT',
            value: 'text'
        },
        {
            name: 'CSV',
            value: 'csv'
        },
        {
            name: 'JSON',
            value: 'json'
        },
    ];

    @ViewChild('indexParameters', { static: true }) indexParameters!: AppGraphRagParametersComponent;

    ngOnInit() {
        const format = this.graphRag().index_config.file_type;
        this.selectedFormat.set(format);
    }

    getConfigurationData(): CreateGraphRagIndexConfigRequest | false {
        if (this.indexParameters.form.invalid) {
            this.toastService.error('Form value invalid');
            return false;
        }

        const formValue = this.indexParameters.form.value;
        const file_type = this.selectedFormat();

        return { ...formValue, file_type };
    }
}
