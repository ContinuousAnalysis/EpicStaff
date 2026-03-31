import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { Spinner2Component } from '../spinner-type2/spinner.component';

@Component({
    selector: 'app-unsaved-indicator',
    imports: [CommonModule],
    templateUrl: './unsaved-indicator.component.html',
    styleUrl: './unsaved-indicator.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnsavedIndicatorComponent {
    @Input() show = false;
}
