import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-manipulation-toolbar',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './manipulation-toolbar.component.html',
    styleUrls: ['./manipulation-toolbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManipulationToolbarComponent {
    public tokenInserted = output<string>();

    public insertToken(token: string): void {
        this.tokenInserted.emit(token);
    }
}

