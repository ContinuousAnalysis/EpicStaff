import {ChangeDetectionStrategy, Component, input} from "@angular/core";
import {ButtonComponent} from "../../../../../../../shared/components/buttons/button/button.component";
import {AppIconComponent} from "../../../../../../../shared/components/app-icon/app-icon.component";
import {CreateCollectionDtoResponse} from "../../../../../models/collection.model";
import {DatePipe} from "@angular/common";

@Component({
    selector: 'app-collection-details-info',
    templateUrl: './collection-info.component.html',
    styleUrls: ['./collection-info.component.scss'],
    imports: [
        ButtonComponent,
        AppIconComponent,
        DatePipe
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionInfoComponent {
    collection = input.required<CreateCollectionDtoResponse>();
    documentTypes = input<string[]>([]);
}
