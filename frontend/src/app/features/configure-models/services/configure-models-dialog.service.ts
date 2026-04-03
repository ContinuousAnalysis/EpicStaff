import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';

import { ConfigureModelsDialogComponent } from '../components/configure-models-dialog/configure-models-dialog.component';

@Injectable({
    providedIn: 'root',
})
export class ConfigureModelsDialogService {
    private readonly dialog: Dialog = inject(Dialog);

    public open(): DialogRef<void> {
        return this.dialog.open<void>(ConfigureModelsDialogComponent, {
            width: 'calc(100vw - 2rem)',
            height: 'calc(100vh - 2rem)',
        });
    }
}
