import { DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/buttons/button/button.component';
import { HelpTooltipComponent } from '../../../../shared/components/help-tooltip/help-tooltip.component';

export interface ImportFlowOptions {
    preserveUuids: boolean;
}

@Component({
    selector: 'app-import-flow-options-dialog',
    imports: [CommonModule, ButtonComponent, HelpTooltipComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './import-flow-options-dialog.html',
    styleUrl: 'import-flow-options-dialog.scss',
})
export class ImportFlowOptionsDialogComponent {
    public preserveUuids = signal(false);

    constructor(private dialogRef: DialogRef<ImportFlowOptions | undefined>) {}

    public confirm(): void {
        this.dialogRef.close({ preserveUuids: this.preserveUuids() });
    }

    public cancel(): void {
        this.dialogRef.close();
    }
}
