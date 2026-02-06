import { inject, Injectable } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ConfigureModelsDialogComponent } from '../components/configure-models-dialog/configure-models-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class ConfigureModelsDialogService {
  private readonly dialog: Dialog = inject(Dialog);

  public open(): DialogRef<void> {
    return this.dialog.open<void>(ConfigureModelsDialogComponent, {
      width: '97vw',
      maxWidth: '97vw',
      height: '95vh',
      maxHeight: '95vh',
    });
  }
}


