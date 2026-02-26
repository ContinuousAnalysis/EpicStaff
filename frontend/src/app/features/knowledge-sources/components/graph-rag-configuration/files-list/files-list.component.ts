import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import {
    AppIconComponent,
    ButtonComponent,
    ListActionsComponent,
    ListComponent,
    ListRowComponent
} from "@shared/components";
import { FileSizePipe } from "../../../../../shared/pipes/file-size.pipe";
import { GraphRagDocument } from "../../../models/graph-rag.model";

@Component({
    selector: 'app-graph-rag-files-list',
    templateUrl: './files-list.component.html',
    styleUrls: ['./files-list.component.scss'],
    imports: [
        AppIconComponent,
        ButtonComponent,
        FileSizePipe,
        ListActionsComponent,
        ListComponent,
        ListRowComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GraphRagFilesListComponent {
    documents = input.required<GraphRagDocument[]>();


    //TODO
    reIncludeFiles(): void {

    }

    //TODO
    onDelete(id: number): void {

    }
}
