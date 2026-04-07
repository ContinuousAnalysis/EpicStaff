import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AppIconComponent } from '@shared/components';

import { AppSvgIconComponent } from '../../../../../../../../shared/components/app-svg-icon/app-svg-icon.component';
import { Rag } from '../../../../../../models/base-rag.model';

@Component({
    selector: 'app-rag-type',
    templateUrl: './rag-type.component.html',
    styleUrls: ['./rag-type.component.scss'],
    imports: [AppIconComponent, AppSvgIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RagTypeComponent {
    rag = input.required<Rag>();
    selected = input<boolean>(false);
}
