import {ChangeDetectionStrategy, Component, input, model, output, Signal, signal} from "@angular/core";
import {ButtonComponent} from "../../../../../../shared/components/buttons/button/button.component";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {GetCollectionRequest} from "../../../../models/collection.model";
import {CollectionComponent} from "./collection/collection.component";
import {SearchComponent} from "../../../../../../shared/components/search/search.component";
import {SelectComponent} from "../../../../../../shared/components/select/select.component";

@Component({
    selector: 'app-collections-list-sidebar',
    templateUrl: './collections-list-sidebar.component.html',
    styleUrls: ['./collections-list-sidebar.component.scss'],
    imports: [
        ButtonComponent,
        ReactiveFormsModule,
        FormsModule,
        CollectionComponent,
        SearchComponent,
        SelectComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionsListItemSidebarComponent {
    searchTerm = signal<string>('');
    collections = input<GetCollectionRequest[]>([]);

    selectedCollectionId = model<number | null>();

    onCreateCollection = output();
}
